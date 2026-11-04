/**
 * Agent state helpers (SRS 2 section 7.2). The server state is the source of truth; tools change
 * it, and a short "What we know so far" summary goes into the system prompt.
 */
import {
  AgentStateSchema,
  MAX_PHONE_TRIES,
  createInitialAgentState,
  type AgentState,
  type CallLang,
  type SavePatientDetailsInput,
  type SavePatientDetailsOutput,
} from "@/contracts";
import { collapseSpaces, dedupeRepeatedName, nfc } from "@/lib/text/normalize";
import { spokenDigitsBn, toE164, validateBdMobile } from "@/lib/text/phone";
import type { ClinicContext } from "@/lib/services";

/** Parse calls.agent_state JSON; falls back to a fresh state when empty or invalid. */
export function parseAgentState(json: unknown, lang: CallLang = "bn"): AgentState {
  const fresh = createInitialAgentState(lang);
  if (!json || typeof json !== "object") return fresh;
  const parsed = AgentStateSchema.safeParse({ ...fresh, ...(json as object) });
  return parsed.success ? parsed.data : fresh;
}

/** A name is 2 to 60 letters, no digits or symbols. */
export function isValidName(name: string): boolean {
  const s = collapseSpaces(nfc(name));
  return s.length >= 2 && s.length <= 60 && !/[0-9০-৯@#$%^&*_=+<>{}[\]\\/|]/.test(s);
}

/**
 * save_patient_details logic (pure). Phone: code cleans and validates (FR-D-VAL); a new number
 * resets confirmation; 3 failed tries -> `too_many_tries` (FR-C15, offer a callback).
 */
export function applyPatientDetails(
  state: AgentState,
  input: SavePatientDetailsInput,
): { state: AgentState; output: SavePatientDetailsOutput } {
  const next: AgentState = structuredClone(state);
  const problems: SavePatientDetailsOutput["problems"] = [];

  const nameBn = input.nameBn !== undefined ? dedupeRepeatedName(nfc(input.nameBn)) : undefined;
  const nameEn = input.nameEn !== undefined ? dedupeRepeatedName(nfc(input.nameEn)) : undefined;
  if (nameBn !== undefined || nameEn !== undefined) {
    const ok = [nameBn, nameEn].filter((x) => x !== undefined && x !== "").every((x) => isValidName(x!));
    if (!ok || (!nameBn && !nameEn)) problems.push("name_invalid");
    else {
      const prev = next.patient;
      const changed = (nameBn && nameBn !== prev?.nameBn) || (nameEn && nameEn !== prev?.nameEn);
      next.patient = {
        nameBn: nameBn || prev?.nameBn,
        nameEn: nameEn || prev?.nameEn,
        nameConfirmed: changed ? false : (prev?.nameConfirmed ?? false),
      };
    }
  }
  if (input.nameConfirmed !== undefined && next.patient) {
    next.patient.nameConfirmed = input.nameConfirmed;
  }

  let phoneSpoken: string | undefined;
  if (input.phoneRaw !== undefined) {
    const check = validateBdMobile(input.phoneRaw);
    const prev = next.phone;
    const same = prev && prev.raw === check.digits;
    if (check.valid) {
      next.phone = {
        raw: check.digits,
        e164: toE164(check.digits),
        valid: true,
        confirmed: same ? prev.confirmed : false,
        tries: prev?.tries ?? 0,
      };
    } else {
      const tries = (prev?.tries ?? 0) + 1;
      next.phone = { raw: check.digits, valid: false, confirmed: false, tries };
      problems.push(...check.problems);
      if (tries >= MAX_PHONE_TRIES) problems.push("too_many_tries");
    }
  }
  if (input.phoneConfirmed !== undefined && next.phone) {
    next.phone.confirmed = input.phoneConfirmed && next.phone.valid;
  }
  if (next.phone?.valid) phoneSpoken = spokenDigitsBn(next.phone.raw);

  return {
    state: next,
    output: { phoneValid: next.phone?.valid ?? false, ...(phoneSpoken ? { phoneSpoken } : {}), problems },
  };
}

/** Dhaka time label for an ISO slot start, for the prompt summary. */
export function slotLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const local = new Date(d.getTime() + 6 * 3600_000);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][local.getUTCDay()];
  return `${wd} ${local.toISOString().slice(0, 10)} ${local.toISOString().slice(11, 16)}`;
}

/** "WHAT WE KNOW SO FAR" block for the system prompt. */
export function summarizeState(state: AgentState, clinic?: Pick<ClinicContext, "doctors">): string {
  const lines: string[] = [];
  if (state.intent) lines.push(`- Intent: ${state.intent}`);
  if (state.patient) {
    const name = [state.patient.nameBn, state.patient.nameEn].filter(Boolean).join(" / ");
    lines.push(`- Name: ${name} (${state.patient.nameConfirmed ? "confirmed" : "NOT confirmed yet"})`);
  } else lines.push("- Name: not given yet");
  if (state.phone) {
    const status = state.phone.valid ? (state.phone.confirmed ? "valid, confirmed" : "valid, NOT confirmed yet") : `INVALID (try ${state.phone.tries} of ${MAX_PHONE_TRIES})`;
    lines.push(`- Phone: ${state.phone.raw} (${status})`);
  } else lines.push("- Phone: not given yet");
  if (state.reason) lines.push(`- Reason: ${state.reason}`);
  if (state.serviceCode) lines.push(`- Service: ${state.serviceCode}`);
  if (state.doctorId) {
    const doc = clinic?.doctors.find((d) => d.id === state.doctorId);
    lines.push(`- Doctor: ${doc ? `${doc.nameBn} (${doc.nameEn}), id ${doc.id}` : state.doctorId}`);
  }
  if (state.requestedWindow) {
    const w = state.requestedWindow;
    lines.push(`- Requested: "${w.phrase}" -> ${[w.resolvedDate, w.partOfDay, w.time].filter(Boolean).join(" ")}`);
  }
  if (state.offeredSlotDetails?.length) {
    lines.push("- Slots offered (use these exact values in book_appointment / reschedule_appointment):");
    for (const s of state.offeredSlotDetails) {
      lines.push(`  - ${slotLabel(s.start)}: slotStart=${s.start} doctorId=${s.doctorId}`);
    }
  } else if (state.offeredSlots?.length) lines.push(`- Slots offered: ${state.offeredSlots.map(slotLabel).join(", ")}`);
  if (state.foundAppointments?.length) {
    lines.push("- Caller's upcoming appointments (from find_appointments):");
    for (const a of state.foundAppointments) {
      lines.push(`  - ${slotLabel(a.slotStart)} with ${a.doctorNameBn}: appointmentId=${a.appointmentId}`);
    }
  }
  if (state.chosenSlot) lines.push(`- Chosen slot: ${slotLabel(state.chosenSlot)}`);
  if (state.appointmentId) lines.push(`- Appointment handled in this call: ${state.appointmentId}`);
  if (state.callbackId) lines.push(`- Callback request created: ${state.callbackId}`);
  if (state.offTopicStreak > 0) lines.push(`- Off-topic turns in a row: ${state.offTopicStreak}`);
  return lines.join("\n");
}
