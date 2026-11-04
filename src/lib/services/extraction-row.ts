/**
 * Finalize step 5 (SRS 2 section 9): merge the LLM extraction with tool-confirmed agent state,
 * then validate in code (SRS 1 section 5.2). Pure.
 */
import type { AgentState, Intent, ValidationErrors } from "@/contracts";
import type { CallExtraction } from "@/lib/agent/postcall";
import type { ClinicContext } from "@/lib/services";
import { hhmmToMin, toLocal } from "./time";
import { checkBdPhone, cleanName, isValidName, nfc } from "./validate";

/** Fields written to call_extractions (Prisma names). */
export interface ExtractionRow {
  intent: Intent;
  patientNameBn: string | null;
  patientNameEn: string | null;
  phoneRaw: string | null;
  phoneE164: string | null;
  phoneValid: boolean;
  reasonForVisit: string | null;
  serviceCode: string | null;
  doctorRequested: string | null;
  preferredDatetimeText: string | null;
  preferredDatetime: Date | null;
  callerConfirmed: boolean;
  sentiment: "positive" | "neutral" | "negative" | null;
  languageMix: "bn" | "en" | "mixed" | null;
  fieldConfidence: Record<string, number>;
  validationErrors: ValidationErrors;
  model: string | null;
  summaryBn: string | null;
  summaryEn: string | null;
}

const INTENTS_NEEDING_CONTACT: Intent[] = ["book", "reschedule", "cancel", "callback"];

const str = (s: string | null | undefined): string | null => (s ? nfc(s).trim() || null : null);

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date rules: future, open day, inside hours, not prayer break, on the slot grid. */
export function datetimeErrors(clinic: ClinicContext, d: Date, now: Date): ValidationErrors {
  const s = clinic.settings;
  const l = toLocal(d);
  const errs: ValidationErrors = [];
  const field = "preferredDatetime";
  if (d.getTime() <= now.getTime()) errs.push({ field, code: "datetime_in_past" });
  if (!s.openWeekdays.includes(l.weekday)) errs.push({ field, code: "datetime_closed_day" });
  if (l.minutes < hhmmToMin(s.open) || l.minutes + s.slotMinutes > hhmmToMin(s.close)) {
    errs.push({ field, code: "datetime_outside_hours" });
  }
  const p0 = hhmmToMin(s.prayerBreak.start);
  const p1 = hhmmToMin(s.prayerBreak.end);
  if (l.minutes < p1 && l.minutes + s.slotMinutes > p0)
    errs.push({ field, code: "datetime_prayer_break" });
  if ((l.minutes - hhmmToMin(s.open)) % s.slotMinutes !== 0 || d.getUTCSeconds() !== 0) {
    errs.push({ field, code: "datetime_not_aligned" });
  }
  return errs;
}

/**
 * Build the call_extractions row. Agent state (tool-confirmed) wins over the LLM.
 * `ex` may be null when every LLM failed; the row is then built from state only.
 */
export function buildExtractionRow(
  ex: CallExtraction | null,
  state: AgentState,
  clinic: ClinicContext,
  now: Date,
): ExtractionRow {
  const intent: Intent = state.intent ?? ex?.intent ?? "unknown";
  const nameBn = cleanName(state.patient?.nameBn) ?? cleanName(ex?.patientNameBn);
  const nameEn = cleanName(state.patient?.nameEn) ?? cleanName(ex?.patientNameEn);
  const phoneRaw = str(state.phone?.raw) ?? str(ex?.phoneRaw);
  const phone = checkBdPhone(state.phone?.e164 ?? phoneRaw);
  const preferred = parseDate(state.chosenSlot) ?? parseDate(ex?.preferredDatetime);

  const errors: ValidationErrors = [];
  const needsContact = INTENTS_NEEDING_CONTACT.includes(intent);
  if (phoneRaw && !phone.valid) {
    errors.push({ field: "phone", code: "phone_invalid", message: phone.problem });
  } else if (!phoneRaw && needsContact) {
    errors.push({ field: "phone", code: "phone_missing" });
  }
  const anyName = nameBn ?? nameEn;
  if (anyName && !isValidName(anyName)) errors.push({ field: "patientName", code: "name_invalid" });
  else if (!anyName && needsContact) errors.push({ field: "patientName", code: "name_missing" });
  // A booked slot was already checked by code at booking time; a past one is fine after the call.
  if (preferred && !state.appointmentId) errors.push(...datetimeErrors(clinic, preferred, now));

  return {
    intent,
    patientNameBn: nameBn,
    patientNameEn: nameEn,
    phoneRaw,
    phoneE164: phone.valid ? phone.e164 : null,
    phoneValid: phone.valid,
    reasonForVisit: str(state.reason) ?? str(ex?.reasonForVisit),
    serviceCode: state.serviceCode ?? str(ex?.serviceCode),
    doctorRequested: str(ex?.doctorRequested),
    preferredDatetimeText: str(state.requestedWindow?.phrase) ?? str(ex?.preferredDatetimeText),
    preferredDatetime: preferred,
    callerConfirmed: Boolean(state.appointmentId) || Boolean(ex?.callerConfirmed),
    sentiment: ex?.sentiment ?? null,
    languageMix: ex?.languageMix ?? null,
    fieldConfidence: ex?.fieldConfidence ?? {},
    validationErrors: errors,
    model: ex?.model ?? null,
    summaryBn: str(ex?.summaryBn) ?? str(state.ended?.summaryBn),
    summaryEn: str(ex?.summaryEn),
  };
}
