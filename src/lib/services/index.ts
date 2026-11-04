/**
 * Service ports: the contract between Agent A (implements) and Agent B (calls from agent tools).
 *
 * Owner: Lead. Agent A replaces the bodies (in these files or by re-exporting real
 * implementations from availability.ts, booking.ts, callbacks.ts, clinic.ts, events.ts).
 * Agent B imports ONLY from "@/lib/services" and never changes these signatures.
 *
 * Rules (SRS 2 section 7.3 and 7.6):
 * - Business rules live here, not in the LLM: confirmation flag, phone validity, slot free,
 *   opening hours, Friday closed, prayer break, lead time, double booking (DB unique index).
 * - Every call writes a call_events row (tool_call / tool_result) via logEvent.
 * - All times are ISO strings in UTC; "spokenBn" fields are ready for TTS (Bangla words).
 */
import type { AgentState, ClinicSettings } from "@/contracts";

/** Passed to every service call from the agent tools. */
export interface ToolContext {
  callId: string;
  clinicId: string;
  /** Current time (inject for tests). */
  now: Date;
  /** Live agent state (name, phone, etc.). Services read it; the agent layer writes it. */
  state: AgentState;
}

/** Compact clinic data for the system prompt and the date resolver. */
export interface ClinicContext {
  id: string;
  slug: string;
  nameBn: string;
  nameEn: string;
  timezone: string; // "Asia/Dhaka"
  addressBn: string;
  addressEn: string;
  phoneDisplay: string;
  settings: ClinicSettings;
  doctors: Array<{
    id: string;
    code: string;
    nameBn: string;
    nameEn: string;
    specialty: string;
    /** Weekly schedule: JS getDay() numbers with HH:mm ranges. */
    schedule: Array<{ weekday: number; start: string; end: string }>;
  }>;
  services: Array<{
    code: string;
    nameBn: string;
    nameEn: string;
    durationMin: number;
    feeBdtFrom: number;
    /** true when feeBdtFrom is a starting price ("from 2,000 taka"). */
    feeIsFrom: boolean;
    specialtyRequired: string | null;
  }>;
}

/*
 * Implementations (Agent A). Signatures are the port signatures above in the Lead's draft:
 *   loadClinicContext(clinicIdOrSlug): Promise<ClinicContext>          (60 s cache)
 *   checkAvailability(ctx, CheckAvailabilityInput): Promise<CheckAvailabilityOutput>
 *   bookAppointment(ctx, BookAppointmentInput): Promise<BookAppointmentOutput>
 *   findAppointments(ctx, FindAppointmentsInput): Promise<FindAppointmentsOutput>
 *   rescheduleAppointment(ctx, RescheduleAppointmentInput): Promise<RescheduleAppointmentOutput>
 *   cancelAppointment(ctx, CancelAppointmentInput): Promise<CancelAppointmentOutput>
 *   getClinicInfo(ctx, GetClinicInfoInput): Promise<GetClinicInfoOutput>
 *   createCallback(ctx, CreateCallbackInput): Promise<CreateCallbackOutput>
 *   logEvent(callId, EventType, payload?): Promise<void>                (never throws)
 */
export { loadClinicContext, getClinicInfo } from "./clinic";
export { checkAvailability } from "./availability-service";
export {
  bookAppointment,
  findAppointments,
  rescheduleAppointment,
  cancelAppointment,
} from "./booking";
export { createCallback } from "./callbacks";
export { logEvent } from "./events";
