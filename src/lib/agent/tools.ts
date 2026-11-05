/**
 * Agent tools (SRS 2 section 7.3). Input schemas come from @/contracts. Business rules live in
 * code: this file (state, phone, confirmation) and @/lib/services (availability, booking).
 * Every tool logs `tool_call` and `tool_result`.
 */
import { tool, type ToolSet } from "ai";
import {
  BookAppointmentInputSchema,
  CancelAppointmentInputSchema,
  CheckAvailabilityInputSchema,
  CreateCallbackInputSchema,
  EndCallToolInputSchema,
  FindAppointmentsInputSchema,
  FlagOffTopicInputSchema,
  GetClinicInfoInputSchema,
  OFF_TOPIC_LIMIT,
  RescheduleAppointmentInputSchema,
  ResolveDatetimeInputSchema,
  SavePatientDetailsInputSchema,
  type AgentState,
  type BookingResult,
  type CallLang,
  type ToolName,
} from "@/contracts";
import * as services from "@/lib/services";
import type { ClinicContext, ToolContext } from "@/lib/services";
import { resolve as resolveDatetime } from "@/lib/text/datetime-bn";
import { localClinicInfo } from "./clinic-knowledge";
import { applyPatientDetails } from "./state";

export type AgentServices = Pick<
  typeof services,
  | "checkAvailability"
  | "bookAppointment"
  | "findAppointments"
  | "rescheduleAppointment"
  | "cancelAppointment"
  | "getClinicInfo"
  | "createCallback"
  | "logEvent"
>;

export interface ToolRuntime {
  callId: string;
  clinicId: string;
  clinic: ClinicContext;
  lang: CallLang;
  now: () => Date;
  /** Live state; tools replace `holder.state`. */
  holder: { state: AgentState };
  services?: AgentServices;
  /** The agent's last spoken turn before this caller turn (for the read-back check). */
  lastAgentText?: string;
}

export interface ToolTracker {
  called: Set<ToolName>;
  /** Pending log writes, awaited at the end of the turn. */
  pending: Promise<unknown>[];
  /** spokenSummaryBn of the last successful booking-type tool in this turn (spoken if the LLM says nothing). */
  lastSpoken?: string;
}

const TEMP_PROBLEM = {
  error: "temporary_problem",
  hint: "A system problem happened. Apologise briefly and offer a staff callback.",
} as const;

function isOk(out: unknown): boolean {
  if (!out || typeof out !== "object") return true;
  const o = out as Record<string, unknown>;
  if (o.ok === false || "error" in o) return false;
  return true;
}

/** Pre-checks for booking-type tools (FR-C18, FR-D-VAL). Returns an error result or null. */
export function bookingPrecheck(state: AgentState): (BookingResult & { hint?: string }) | null {
  if (!state.patient?.nameBn && !state.patient?.nameEn) {
    return { ok: false, error: "missing_name", hint: "Ask the caller's name first." };
  }
  if (!state.phone) return { ok: false, error: "missing_phone", hint: "Ask the mobile number first." };
  if (!state.phone.valid) return { ok: false, error: "invalid_phone", hint: "Ask for a valid 11 digit mobile number." };
  if (!state.patient.nameConfirmed || !state.phone.confirmed) {
    return {
      ok: false,
      error: "need_confirmation",
      hint: "Confirm the name and the phone number with the caller, then save them with nameConfirmed/phoneConfirmed=true.",
    };
  }
  return null;
}

/**
 * Was the agent's last turn a full read-back question? (TC-08: the caller picked a slot and the
 * LLM booked at once.) It must ask something and include the caller's name or the last phone
 * digits ("শেষ চার" / "last four"), which a slot offer never does.
 */
export function wasReadBack(lastAgentText: string | undefined, state: AgentState): boolean {
  const t = (lastAgentText ?? "").normalize("NFC");
  if (!/[?？]/.test(t)) return false;
  const name = state.patient?.nameBn?.normalize("NFC");
  const nameEn = state.patient?.nameEn?.toLowerCase();
  if (name && t.includes(name)) return true;
  if (nameEn && t.toLowerCase().includes(nameEn)) return true;
  return /শেষ|last (4|four)/i.test(t);
}

/** Mark a present name and valid phone as confirmed (after a yes to the full read-back). */
export function confirmIdentity(state: AgentState): Partial<AgentState> {
  const patch: Partial<AgentState> = {};
  if (state.patient && (state.patient.nameBn || state.patient.nameEn) && !state.patient.nameConfirmed) {
    patch.patient = { ...state.patient, nameConfirmed: true };
  }
  if (state.phone?.valid && !state.phone.confirmed) patch.phone = { ...state.phone, confirmed: true };
  return patch;
}

export function createAgentTools(rt: ToolRuntime, tracker: ToolTracker): ToolSet {
  const svc: AgentServices = rt.services ?? services;
  const ctx = (): ToolContext => ({ callId: rt.callId, clinicId: rt.clinicId, now: rt.now(), state: rt.holder.state });
  const set = (patch: Partial<AgentState>) => {
    rt.holder.state = { ...rt.holder.state, ...patch };
  };

  function wrap<I, O>(name: ToolName, run: (input: I) => Promise<O> | O) {
    return async (input: I): Promise<O | typeof TEMP_PROBLEM> => {
      const t0 = Date.now();
      tracker.called.add(name);
      tracker.pending.push(svc.logEvent(rt.callId, "tool_call", { name, input }));
      try {
        const output = await run(input);
        const spoken = (output as { ok?: unknown; spokenSummaryBn?: unknown } | null)?.spokenSummaryBn;
        if (isOk(output) && typeof spoken === "string" && spoken) tracker.lastSpoken = spoken;
        tracker.pending.push(
          svc.logEvent(rt.callId, "tool_result", { name, output, ok: isOk(output), ms: Date.now() - t0 }),
        );
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message.slice(0, 300) : String(err);
        console.error(`[tool ${name}]`, message);
        tracker.pending.push(
          svc.logEvent(rt.callId, "tool_result", { name, ok: false, ms: Date.now() - t0, output: { error: message } }),
        );
        return TEMP_PROBLEM;
      }
    };
  }

  return {
    save_patient_details: tool({
      description:
        "Save or correct the caller's name and/or mobile number. phoneRaw must be digits only (0-9): convert spoken words like জিরো/ওয়ান/double yourself. Set nameConfirmed/phoneConfirmed=true only after the caller said yes to your read-back.",
      inputSchema: SavePatientDetailsInputSchema,
      execute: wrap("save_patient_details", (input) => {
        const r = applyPatientDetails(rt.holder.state, input);
        rt.holder.state = r.state;
        return r.output;
      }),
    }),

    resolve_datetime: tool({
      description:
        "Turn the caller's day/time words (Bangla or English) into a real date in Asia/Dhaka. Always use this; never compute dates yourself. Say spokenBn aloud to confirm.",
      inputSchema: ResolveDatetimeInputSchema,
      execute: wrap("resolve_datetime", (input) => {
        const phrase = [input.phrase, input.timeHint].filter(Boolean).join(" ");
        const out = resolveDatetime(phrase, rt.now(), rt.clinic.settings);
        if (out.isoDate) {
          set({
            requestedWindow: {
              phrase: input.phrase,
              resolvedDate: out.isoDate,
              ...(out.partOfDay ? { partOfDay: out.partOfDay } : {}),
              ...(out.time ? { time: out.time } : {}),
            },
          });
        }
        return out;
      }),
    }),

    check_availability: tool({
      description:
        "Find up to 3 free slots for a date from resolve_datetime (and part of day or time, service, doctor). Offer the slots using their spokenBn.",
      inputSchema: CheckAvailabilityInputSchema,
      execute: wrap("check_availability", async (input) => {
        const out = await svc.checkAvailability(ctx(), input);
        const doctors = new Set(out.slots.map((s) => s.doctorId));
        set({
          intent: rt.holder.state.intent ?? "book",
          offeredSlots: out.slots.map((s) => s.start),
          offeredSlotDetails: out.slots.map((s) => ({ start: s.start, doctorId: s.doctorId })),
          ...(input.serviceCode ? { serviceCode: input.serviceCode } : {}),
          ...(doctors.size === 1 ? { doctorId: [...doctors][0] } : {}),
        });
        return out;
      }),
    }),

    book_appointment: tool({
      description:
        "Book the chosen slot. Call ONLY after reading back all details and the caller clearly said yes; callerConfirmed must be true.",
      inputSchema: BookAppointmentInputSchema,
      execute: wrap("book_appointment", async (input) => {
        // The final read-back says the name and phone too, so the caller's yes to it confirms them
        // (TC-03: stacked questions left them unconfirmed and booking looped).
        if (rt.lastAgentText !== undefined && !wasReadBack(rt.lastAgentText, rt.holder.state)) {
          return {
            ok: false as const,
            error: "need_confirmation" as const,
            hint: "Do not book yet. In one sentence read back the name, the last 4 phone digits, service, doctor, day, date and time, ask \"ঠিক আছে?\" and wait for the caller's yes.",
          };
        }
        if (input.callerConfirmed === true) set(confirmIdentity(rt.holder.state));
        const pre = bookingPrecheck(rt.holder.state);
        if (pre) return pre;
        set({ chosenSlot: input.slotStart, doctorId: input.doctorId, serviceCode: input.serviceCode, reason: input.reason });
        const out = await svc.bookAppointment(ctx(), input);
        if (out.ok) set({ appointmentId: out.appointmentId, intent: "book" });
        return out;
      }),
    }),

    find_appointments: tool({
      description:
        "List the caller's own upcoming appointments by their confirmed phone (for reschedule or cancel).",
      inputSchema: FindAppointmentsInputSchema,
      execute: wrap("find_appointments", async (input) => {
        if (!input.phoneRaw && !rt.holder.state.phone?.valid) {
          return { appointments: [], error: "missing_phone" as const };
        }
        const out = await svc.findAppointments(ctx(), input);
        set({
          foundAppointments: out.appointments.slice(0, 10).map((a) => ({
            appointmentId: a.appointmentId,
            slotStart: a.slotStart,
            doctorNameBn: a.doctorNameBn,
          })),
        });
        return out;
      }),
    }),

    reschedule_appointment: tool({
      description:
        "Move an appointment to a new free slot. Call ONLY after the caller clearly confirmed the new time; callerConfirmed must be true.",
      inputSchema: RescheduleAppointmentInputSchema,
      execute: wrap("reschedule_appointment", async (input) => {
        const pre = bookingPrecheck(rt.holder.state);
        if (pre && pre.ok === false && pre.error !== "missing_name") return pre;
        const out = await svc.rescheduleAppointment(ctx(), input);
        if (out.ok) set({ appointmentId: out.appointmentId, chosenSlot: input.newSlotStart, intent: "reschedule" });
        return out;
      }),
    }),

    cancel_appointment: tool({
      description: "Cancel an appointment. Call ONLY after the caller clearly said yes; callerConfirmed must be true.",
      inputSchema: CancelAppointmentInputSchema,
      execute: wrap("cancel_appointment", async (input) => {
        const pre = bookingPrecheck(rt.holder.state);
        if (pre && pre.ok === false && pre.error !== "missing_name") return pre;
        const out = await svc.cancelAppointment(ctx(), input);
        if (out.ok) set({ appointmentId: out.appointmentId, intent: "cancel" });
        return out;
      }),
    }),

    get_clinic_info: tool({
      description: "Facts about the clinic (hours, address, directions, services, fees, doctors, preparation, payment, parking).",
      inputSchema: GetClinicInfoInputSchema,
      execute: wrap("get_clinic_info", async (input) => {
        if (!rt.holder.state.intent) set({ intent: "enquiry" });
        try {
          return await svc.getClinicInfo(ctx(), input);
        } catch {
          return localClinicInfo(rt.clinic, input.topic);
        }
      }),
    }),

    create_callback: tool({
      description:
        "Ask clinic staff to call the caller back (medical question, urgent, complaint, billing, wants a human, unknown info). Needs the caller's name and phone in state.",
      inputSchema: CreateCallbackInputSchema,
      execute: wrap("create_callback", async (input) => {
        const out = await svc.createCallback(ctx(), input);
        if (out.ok) set({ callbackId: out.callbackId, intent: rt.holder.state.intent ?? "callback" });
        return out;
      }),
    }),

    flag_off_topic: tool({
      description:
        "Call when the caller's message is irrelevant, a prank or abusive. If endCall is true, say a polite goodbye and call end_call.",
      inputSchema: FlagOffTopicInputSchema,
      execute: wrap("flag_off_topic", (input) => {
        const streak = rt.holder.state.offTopicStreak + (input.kind === "abuse" ? 2 : 1);
        set({ offTopicStreak: streak });
        return { streak, endCall: streak >= OFF_TOPIC_LIMIT };
      }),
    }),

    end_call: tool({
      description: "End the call after your goodbye sentence. summaryBn: one or two Bangla sentences of what was agreed.",
      inputSchema: EndCallToolInputSchema,
      execute: wrap("end_call", (input) => {
        set({ ended: { reason: input.reason, summaryBn: input.summaryBn } });
        return { ok: true as const };
      }),
    }),
  };
}
