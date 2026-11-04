/**
 * Voice agent contracts (SRS 2 sections 7.2, 7.3 and 9). OWNED BY THE LEAD AGENT.
 *
 * - `AgentState` is stored in calls.agent_state and is the source of truth during a call.
 * - Each tool has an input schema (given to the AI SDK `tool({ inputSchema })`) and an output
 *   schema (what the tool returns to the LLM). Business rules live in the tool code, never in
 *   the LLM.
 * - Times: `isoDate` is "YYYY-MM-DD" in Asia/Dhaka; slot starts are ISO 8601 with offset,
 *   for example "2026-11-08T18:00:00+06:00".
 */
import { z } from "zod";
import {
  CallbackCategorySchema,
  CallLangSchema,
  ClinicInfoTopicSchema,
  DatetimeProblemSchema,
  IntentSchema,
  LanguageMixSchema,
  OffTopicKindSchema,
  PartOfDaySchema,
  PrioritySchema,
  SentimentSchema,
  ServiceCodeSchema,
  AppointmentStatusSchema,
} from "./enums";

const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM 24h");

// ---------------------------------------------------------------------------
// Agent state (calls.agent_state), SRS 2 section 7.2
// ---------------------------------------------------------------------------

export const AgentStateSchema = z.object({
  intent: IntentSchema.optional(),
  patient: z
    .object({
      nameBn: z.string().optional(),
      nameEn: z.string().optional(),
      nameConfirmed: z.boolean(),
    })
    .optional(),
  phone: z
    .object({
      /** Digits as given by the LLM (before cleaning). */
      raw: z.string(),
      /** "+8801XXXXXXXXX" when valid. */
      e164: z.string().optional(),
      valid: z.boolean(),
      confirmed: z.boolean(),
      /** Failed validation attempts (max 3, then offer a callback: FR-C15). */
      tries: z.number().int().nonnegative(),
    })
    .optional(),
  reason: z.string().optional(),
  serviceCode: ServiceCodeSchema.optional(),
  doctorId: z.string().optional(),
  requestedWindow: z
    .object({
      phrase: z.string(),
      resolvedDate: isoDate.optional(),
      partOfDay: PartOfDaySchema.optional(),
      time: hhmm.optional(),
    })
    .optional(),
  /** Slot starts offered in the last check_availability. */
  offeredSlots: z.array(isoDateTime).optional(),
  /**
   * Offered slots with their doctor (I-08). Tool results are not in the next turn's history, so
   * the prompt summary must carry the exact slotStart + doctorId the LLM passes to booking.
   */
  offeredSlotDetails: z.array(z.object({ start: isoDateTime, doctorId: z.string() })).optional(),
  /** Appointments found by find_appointments (ids for reschedule/cancel in a later turn). */
  foundAppointments: z
    .array(z.object({ appointmentId: z.string(), slotStart: isoDateTime, doctorNameBn: z.string() }))
    .max(10)
    .optional(),
  chosenSlot: isoDateTime.optional(),
  /** Appointment created, moved or cancelled in this call. */
  appointmentId: z.string().optional(),
  /** Irrelevant/prank turns in a row (FR-C12). */
  offTopicStreak: z.number().int().nonnegative(),
  /** Silence prompts sent so far (FR-C16). */
  silencePrompts: z.number().int().nonnegative(),
  callbackId: z.string().optional(),
  lang: CallLangSchema,
  /** Latest accepted turnSeq; older turns are rejected with `stale_turn` (SRS 2 section 5.2). */
  lastTurnSeq: z.number().int().optional(),
  /** Next agent sentence seq to use in SSE `sentence` events. */
  nextAgentSeq: z.number().int().nonnegative().optional(),
  /** Set when end_call ran; the reason and Bangla summary. */
  ended: z.object({ reason: z.string(), summaryBn: z.string() }).optional(),
});
export type AgentState = z.infer<typeof AgentStateSchema>;

/** Fresh state for a new call. */
export function createInitialAgentState(lang: AgentState["lang"] = "bn"): AgentState {
  return { offTopicStreak: 0, silencePrompts: 0, lang, nextAgentSeq: 0 };
}

/** Max phone attempts before offering a callback (FR-C15). */
export const MAX_PHONE_TRIES = 3;
/** Off-topic turns in a row that end the call as spam (FR-C12). */
export const OFF_TOPIC_LIMIT = 3;
/** Silence prompts before ending the call as incomplete (FR-C16). */
export const MAX_SILENCE_PROMPTS = 2;

// ---------------------------------------------------------------------------
// Tools, SRS 2 section 7.3
// ---------------------------------------------------------------------------

export const ToolName = [
  "save_patient_details",
  "resolve_datetime",
  "check_availability",
  "book_appointment",
  "find_appointments",
  "reschedule_appointment",
  "cancel_appointment",
  "get_clinic_info",
  "create_callback",
  "flag_off_topic",
  "end_call",
] as const;
export const ToolNameSchema = z.enum(ToolName);
export type ToolName = (typeof ToolName)[number];

/** Error codes a booking-type tool can return to the LLM. */
export const BookingError = [
  "slot_taken",
  "need_confirmation",
  "invalid_phone",
  "missing_name",
  "missing_phone",
  "not_found",
  "invalid_slot",
  "not_allowed",
] as const;
export const BookingErrorSchema = z.enum(BookingError);
export type BookingError = (typeof BookingError)[number];

// save_patient_details --------------------------------------------------------

export const SavePatientDetailsInputSchema = z.object({
  nameBn: z.string().max(60).optional().describe("Caller name in Bangla script, as said"),
  nameEn: z.string().max(60).optional().describe("Caller name romanised in Latin letters"),
  nameConfirmed: z.boolean().optional().describe("true only after the caller confirmed the name"),
  phoneRaw: z
    .string()
    .max(30)
    .optional()
    .describe(
      "Phone as digits only (0-9). Convert spoken words like জিরো/ওয়ান/double yourself before calling.",
    ),
  phoneConfirmed: z
    .boolean()
    .optional()
    .describe("true only after the caller confirmed the digit-by-digit read-back"),
});
export type SavePatientDetailsInput = z.infer<typeof SavePatientDetailsInputSchema>;

export const PhoneProblem = ["too_short", "too_long", "bad_prefix", "not_digits", "empty"] as const;
export const PhoneProblemSchema = z.enum(PhoneProblem);
export type PhoneProblem = (typeof PhoneProblem)[number];

export const SavePatientDetailsOutputSchema = z.object({
  phoneValid: z.boolean(),
  /** Digit-by-digit Bangla words to read back, for example "শূন্য, এক, সাত, ...". */
  phoneSpoken: z.string().optional(),
  problems: z.array(
    z.union([PhoneProblemSchema, z.literal("name_invalid"), z.literal("too_many_tries")]),
  ),
});
export type SavePatientDetailsOutput = z.infer<typeof SavePatientDetailsOutputSchema>;

// resolve_datetime -------------------------------------------------------------

export const ResolveDatetimeInputSchema = z.object({
  phrase: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "The caller's date/time words, for example 'আগামী রবিবার সন্ধ্যায়' or 'next Sunday evening'",
    ),
  timeHint: z
    .string()
    .max(50)
    .optional()
    .describe("Clock time if said separately, for example '১০টা'"),
});
export type ResolveDatetimeInput = z.infer<typeof ResolveDatetimeInputSchema>;

export const ResolveDatetimeOutputSchema = z.object({
  ok: z.boolean(),
  isoDate: isoDate.optional(),
  partOfDay: PartOfDaySchema.optional(),
  time: hhmm.optional(),
  /** Say this aloud, for example "রবিবার, আট নভেম্বর, সন্ধ্যা". */
  spokenBn: z.string(),
  problems: z.array(DatetimeProblemSchema),
});
export type ResolveDatetimeOutput = z.infer<typeof ResolveDatetimeOutputSchema>;

// check_availability -----------------------------------------------------------

export const CheckAvailabilityInputSchema = z.object({
  isoDate: isoDate.describe("YYYY-MM-DD from resolve_datetime"),
  partOfDay: PartOfDaySchema.optional(),
  time: hhmm.optional().describe("HH:MM 24h from resolve_datetime"),
  serviceCode: ServiceCodeSchema.optional(),
  doctorPreference: z.string().max(60).optional().describe("Doctor name or id if the caller asked"),
});
export type CheckAvailabilityInput = z.infer<typeof CheckAvailabilityInputSchema>;

export const SlotOfferSchema = z.object({
  start: isoDateTime,
  doctorId: z.string(),
  doctorNameBn: z.string(),
  /** For example "রবিবার, আট নভেম্বর, সন্ধ্যা ছয়টা". */
  spokenBn: z.string(),
});
export type SlotOffer = z.infer<typeof SlotOfferSchema>;

export const CheckAvailabilityOutputSchema = z.object({
  /** Max 3. Empty when nothing is free in the next 3 open days. */
  slots: z.array(SlotOfferSchema).max(3),
  /** true when the slots are on later days because the requested day was full. */
  movedToLaterDays: z.boolean().optional(),
  problems: z.array(DatetimeProblemSchema).optional(),
});
export type CheckAvailabilityOutput = z.infer<typeof CheckAvailabilityOutputSchema>;

// book_appointment -------------------------------------------------------------

export const BookAppointmentInputSchema = z.object({
  slotStart: isoDateTime,
  doctorId: z.string(),
  serviceCode: ServiceCodeSchema,
  reason: z.string().max(200),
  /** Must be literally true: set only after the caller said yes to the full read-back (FR-C18). */
  callerConfirmed: z.literal(true),
});
export type BookAppointmentInput = z.infer<typeof BookAppointmentInputSchema>;

export const BookingResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    appointmentId: z.string(),
    /** Short Bangla confirmation the agent can say. */
    spokenSummaryBn: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    error: BookingErrorSchema,
    /** Optional alternatives when error is slot_taken. */
    alternatives: z.array(SlotOfferSchema).max(3).optional(),
  }),
]);
export type BookingResult = z.infer<typeof BookingResultSchema>;
export const BookAppointmentOutputSchema = BookingResultSchema;
export type BookAppointmentOutput = BookingResult;

// find_appointments ------------------------------------------------------------

export const FindAppointmentsInputSchema = z.object({
  phoneRaw: z
    .string()
    .max(30)
    .optional()
    .describe("Digits only. Defaults to the confirmed phone in the call state."),
});
export type FindAppointmentsInput = z.infer<typeof FindAppointmentsInputSchema>;

export const FoundAppointmentSchema = z.object({
  appointmentId: z.string(),
  slotStart: isoDateTime,
  doctorNameBn: z.string(),
  serviceNameBn: z.string().optional(),
  status: AppointmentStatusSchema,
  spokenBn: z.string(),
});
export type FoundAppointment = z.infer<typeof FoundAppointmentSchema>;

export const FindAppointmentsOutputSchema = z.object({
  /** Upcoming active appointments of THIS caller only. */
  appointments: z.array(FoundAppointmentSchema),
  error: z.enum(["invalid_phone", "missing_phone"]).optional(),
});
export type FindAppointmentsOutput = z.infer<typeof FindAppointmentsOutputSchema>;

// reschedule_appointment -------------------------------------------------------

export const RescheduleAppointmentInputSchema = z.object({
  appointmentId: z.string(),
  newSlotStart: isoDateTime,
  newDoctorId: z.string().optional(),
  callerConfirmed: z.literal(true),
});
export type RescheduleAppointmentInput = z.infer<typeof RescheduleAppointmentInputSchema>;
export const RescheduleAppointmentOutputSchema = BookingResultSchema;
export type RescheduleAppointmentOutput = BookingResult;

// cancel_appointment -----------------------------------------------------------

export const CancelAppointmentInputSchema = z.object({
  appointmentId: z.string(),
  callerConfirmed: z.literal(true),
});
export type CancelAppointmentInput = z.infer<typeof CancelAppointmentInputSchema>;
export const CancelAppointmentOutputSchema = BookingResultSchema;
export type CancelAppointmentOutput = BookingResult;

// get_clinic_info --------------------------------------------------------------

export const GetClinicInfoInputSchema = z.object({ topic: ClinicInfoTopicSchema });
export type GetClinicInfoInput = z.infer<typeof GetClinicInfoInputSchema>;

export const GetClinicInfoOutputSchema = z.object({
  topic: ClinicInfoTopicSchema,
  /** Short Bangla facts from the clinic data. Never invented. */
  factsBn: z.string(),
});
export type GetClinicInfoOutput = z.infer<typeof GetClinicInfoOutputSchema>;

// create_callback --------------------------------------------------------------

export const CreateCallbackInputSchema = z.object({
  category: CallbackCategorySchema,
  reason: z.string().min(1).max(300),
  priority: PrioritySchema,
});
export type CreateCallbackInput = z.infer<typeof CreateCallbackInputSchema>;

export const CreateCallbackOutputSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), callbackId: z.string() }),
  z.object({
    ok: z.literal(false),
    /** Ask the caller for the missing detail, then call again. */
    error: z.enum(["missing_name", "missing_phone", "invalid_phone"]),
  }),
]);
export type CreateCallbackOutput = z.infer<typeof CreateCallbackOutputSchema>;

// flag_off_topic ---------------------------------------------------------------

export const FlagOffTopicInputSchema = z.object({ kind: OffTopicKindSchema });
export type FlagOffTopicInput = z.infer<typeof FlagOffTopicInputSchema>;

export const FlagOffTopicOutputSchema = z.object({
  streak: z.number().int().nonnegative(),
  /** true at OFF_TOPIC_LIMIT: say a polite goodbye and call end_call. */
  endCall: z.boolean(),
});
export type FlagOffTopicOutput = z.infer<typeof FlagOffTopicOutputSchema>;

// end_call ---------------------------------------------------------------------

export const EndCallToolInputSchema = z.object({
  reason: z.string().min(1).max(200),
  summaryBn: z.string().min(1).max(500),
});
export type EndCallToolInput = z.infer<typeof EndCallToolInputSchema>;

export const EndCallToolOutputSchema = z.object({ ok: z.literal(true) });
export type EndCallToolOutput = z.infer<typeof EndCallToolOutputSchema>;

/** Map of every tool to its input and output schema (for registration and tests). */
export const TOOL_SCHEMAS = {
  save_patient_details: {
    input: SavePatientDetailsInputSchema,
    output: SavePatientDetailsOutputSchema,
  },
  resolve_datetime: { input: ResolveDatetimeInputSchema, output: ResolveDatetimeOutputSchema },
  check_availability: {
    input: CheckAvailabilityInputSchema,
    output: CheckAvailabilityOutputSchema,
  },
  book_appointment: { input: BookAppointmentInputSchema, output: BookAppointmentOutputSchema },
  find_appointments: { input: FindAppointmentsInputSchema, output: FindAppointmentsOutputSchema },
  reschedule_appointment: {
    input: RescheduleAppointmentInputSchema,
    output: RescheduleAppointmentOutputSchema,
  },
  cancel_appointment: {
    input: CancelAppointmentInputSchema,
    output: CancelAppointmentOutputSchema,
  },
  get_clinic_info: { input: GetClinicInfoInputSchema, output: GetClinicInfoOutputSchema },
  create_callback: { input: CreateCallbackInputSchema, output: CreateCallbackOutputSchema },
  flag_off_topic: { input: FlagOffTopicInputSchema, output: FlagOffTopicOutputSchema },
  end_call: { input: EndCallToolInputSchema, output: EndCallToolOutputSchema },
} as const satisfies Record<ToolName, { input: z.ZodType; output: z.ZodType }>;

/** Payloads of the `tool_call` / `tool_result` call events. */
export const ToolEventPayloadSchema = z.object({
  name: ToolNameSchema,
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  ok: z.boolean().optional(),
  ms: z.number().optional(),
});
export type ToolEventPayload = z.infer<typeof ToolEventPayloadSchema>;

// ---------------------------------------------------------------------------
// Post-call extraction (finalize step 4), SRS 2 section 9
// ---------------------------------------------------------------------------

const confidence = z.number().min(0).max(1);

/** Structured output schema for the extraction LLM call. Prefer tool-confirmed values. */
export const ExtractionResultSchema = z.object({
  intent: IntentSchema,
  patientNameBn: z.string().nullable(),
  patientNameEn: z.string().nullable(),
  phoneRaw: z.string().nullable(),
  reasonForVisit: z.string().nullable(),
  serviceCode: ServiceCodeSchema.nullable(),
  doctorRequested: z.string().nullable(),
  preferredDatetimeText: z.string().nullable(),
  /** ISO 8601 with offset, or null. */
  preferredDatetime: isoDateTime.nullable(),
  callerConfirmed: z.boolean(),
  sentiment: SentimentSchema,
  languageMix: LanguageMixSchema,
  summaryBn: z.string(),
  summaryEn: z.string(),
  fieldConfidence: z.record(z.string(), confidence),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/** Codes written to call_extractions.validation_errors (finalize step 5). */
export const ValidationErrorCode = [
  "phone_invalid",
  "phone_missing",
  "name_invalid",
  "name_missing",
  "datetime_in_past",
  "datetime_outside_hours",
  "datetime_closed_day",
  "datetime_prayer_break",
  "datetime_not_aligned",
] as const;
export const ValidationErrorCodeSchema = z.enum(ValidationErrorCode);
export type ValidationErrorCode = (typeof ValidationErrorCode)[number];

export const ValidationErrorsSchema = z.array(
  z.object({ field: z.string(), code: ValidationErrorCodeSchema, message: z.string().optional() }),
);
export type ValidationErrors = z.infer<typeof ValidationErrorsSchema>;

// ---------------------------------------------------------------------------
// Status rules input (status.ts, SRS 1 section 4.5.1)
// ---------------------------------------------------------------------------

/** Facts from the DB that decide the final status. Computed by finalize, never by the LLM. */
export const StatusFactsSchema = z.object({
  /** Appointment actions done in this call, oldest first. */
  appointmentActions: z.array(
    z.object({ action: z.enum(["created", "rescheduled", "cancelled"]), at: isoDateTime }),
  ),
  callbacksCreated: z.number().int().nonnegative(),
  /** Max off-topic streak reached, or abuse flagged. */
  offTopicStreakMax: z.number().int().nonnegative(),
  abuse: z.boolean(),
  /** Agent answered questions (clinic info) at least once. */
  infoGiven: z.boolean(),
  /** Caller said anything at all. */
  callerSpoke: z.boolean(),
  endReason: z.enum(["caller_hangup", "agent_end", "time_limit", "silence", "error", "tab_closed"]),
  /** All providers failed or a server error ended the call. */
  technicalFailure: z.boolean(),
});
export type StatusFacts = z.infer<typeof StatusFactsSchema>;
