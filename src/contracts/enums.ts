/**
 * Shared enums (SRS 2 section 5.1). OWNED BY THE LEAD AGENT: do not change without the Lead.
 *
 * Pattern: every enum is a `const` tuple (usable at runtime, for example in dropdowns), a zod
 * schema with the suffix `Schema`, and a TypeScript type with the same name as the tuple.
 * Database enums in prisma/schema.prisma use the same values; keep them in sync.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/** Call status shown in the portal. `processing` until finalize finishes (FR-D14, FR-D15). */
export const CallStatus = [
  "processing",
  "booked",
  "rescheduled",
  "cancelled",
  "enquiry",
  "follow_up_needed",
  "incomplete",
  "failed",
  "spam",
] as const;
export const CallStatusSchema = z.enum(CallStatus);
export type CallStatus = (typeof CallStatus)[number];

/** Final statuses only (output of the status rules, SRS 1 section 4.5.1). */
export const FinalCallStatus = [
  "booked",
  "rescheduled",
  "cancelled",
  "enquiry",
  "follow_up_needed",
  "incomplete",
  "failed",
  "spam",
] as const satisfies readonly CallStatus[];
export const FinalCallStatusSchema = z.enum(FinalCallStatus);
export type FinalCallStatus = (typeof FinalCallStatus)[number];

/** Post-call pipeline state (calls.processing_state). */
export const ProcessingState = ["pending", "running", "done", "failed"] as const;
export const ProcessingStateSchema = z.enum(ProcessingState);
export type ProcessingState = (typeof ProcessingState)[number];

/** Why a call ended (POST /api/calls/:id/end). */
export const EndReason = [
  "caller_hangup",
  "agent_end",
  "time_limit",
  "silence",
  "error",
  "tab_closed",
] as const;
export const EndReasonSchema = z.enum(EndReason);
export type EndReason = (typeof EndReason)[number];

/** Language of the call UI and of the agent's replies. */
export const CallLang = ["bn", "en"] as const;
export const CallLangSchema = z.enum(CallLang);
export type CallLang = (typeof CallLang)[number];

/** What the caller wanted. */
export const Intent = [
  "book",
  "reschedule",
  "cancel",
  "enquiry",
  "callback",
  "other",
  "unknown",
] as const;
export const IntentSchema = z.enum(Intent);
export type Intent = (typeof Intent)[number];

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

export const Speaker = ["agent", "caller", "system"] as const;
export const SpeakerSchema = z.enum(Speaker);
export type Speaker = (typeof Speaker)[number];

/** `live` = saved during the call; `batch` = post-call re-transcription of the recording. */
export const TranscriptSource = ["live", "batch"] as const;
export const TranscriptSourceSchema = z.enum(TranscriptSource);
export type TranscriptSource = (typeof TranscriptSource)[number];

/** How the caller turn arrived (FR-B13 "Type instead"). */
export const InputMode = ["voice", "typed"] as const;
export const InputModeSchema = z.enum(InputMode);
export type InputMode = (typeof InputMode)[number];

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/** Speech to text. `browser` = Web Speech API bn-BD in the browser (default). */
export const SttProviderId = ["browser", "elevenlabs", "openai", "azure"] as const;
export const SttProviderIdSchema = z.enum(SttProviderId);
export type SttProviderId = (typeof SttProviderId)[number];

/** Server-side STT providers only (POST /api/stt). */
export const ServerSttProviderId = [
  "elevenlabs",
  "openai",
  "azure",
] as const satisfies readonly SttProviderId[];
export const ServerSttProviderIdSchema = z.enum(ServerSttProviderId);
export type ServerSttProviderId = (typeof ServerSttProviderId)[number];

/** Text to speech. ElevenLabs is the default. */
export const TtsProviderId = ["elevenlabs", "openai", "azure"] as const;
export const TtsProviderIdSchema = z.enum(TtsProviderId);
export type TtsProviderId = (typeof TtsProviderId)[number];

/** LLM vendors behind the Vercel AI SDK. */
export const LlmProviderId = ["google", "openai"] as const;
export const LlmProviderIdSchema = z.enum(LlmProviderId);
export type LlmProviderId = (typeof LlmProviderId)[number];

/** Providers a clinic can bring its own key for (BYOK). */
export const KeyProvider = ["elevenlabs", "openai", "azure"] as const;
export const KeyProviderSchema = z.enum(KeyProvider);
export type KeyProvider = (typeof KeyProvider)[number];

/** Whose key paid for the call. */
export const KeySource = ["platform", "byok"] as const;
export const KeySourceSchema = z.enum(KeySource);
export type KeySource = (typeof KeySource)[number];

/**
 * Fallback order (owner decisions 2026-11-04). The registry walks these lists starting at the
 * provider the caller picked; providers before it in the list are not used.
 */
export const TTS_FALLBACK_ORDER: readonly TtsProviderId[] = ["elevenlabs", "openai", "azure"];
/** Owner decision T-22: OpenAI first, ElevenLabs last (Chrome's recognizer is the client-side last resort). */
export const SERVER_STT_FALLBACK_ORDER: readonly ServerSttProviderId[] = [
  "openai",
  "azure",
  "elevenlabs",
];

// ---------------------------------------------------------------------------
// Staff, clinic, appointments, callbacks
// ---------------------------------------------------------------------------

export const StaffRole = ["admin", "receptionist"] as const;
export const StaffRoleSchema = z.enum(StaffRole);
export type StaffRole = (typeof StaffRole)[number];

export const Specialty = ["general", "orthodontist", "oral_surgeon"] as const;
export const SpecialtySchema = z.enum(Specialty);
export type Specialty = (typeof Specialty)[number];

/** Service codes seeded from SRS 1 section 4.4 (services.code). */
export const ServiceCode = [
  "checkup",
  "scaling",
  "filling",
  "root_canal",
  "extraction",
  "braces_consultation",
  "xray",
] as const;
export const ServiceCodeSchema = z.enum(ServiceCode);
export type ServiceCode = (typeof ServiceCode)[number];

export const AppointmentStatus = [
  "booked",
  "rescheduled",
  "cancelled",
  "completed",
  "no_show",
] as const;
export const AppointmentStatusSchema = z.enum(AppointmentStatus);
export type AppointmentStatus = (typeof AppointmentStatus)[number];

/** Statuses that hold a slot (partial unique index in prisma/sql/001_constraints_rls.sql). */
export const ACTIVE_APPOINTMENT_STATUSES = [
  "booked",
  "rescheduled",
] as const satisfies readonly AppointmentStatus[];

export const AppointmentAction = ["created", "rescheduled", "cancelled"] as const;
export const AppointmentActionSchema = z.enum(AppointmentAction);
export type AppointmentAction = (typeof AppointmentAction)[number];

export const CallbackCategory = [
  "medical",
  "urgent",
  "complaint",
  "billing",
  "human_request",
  "unknown_info",
  "other",
] as const;
export const CallbackCategorySchema = z.enum(CallbackCategory);
export type CallbackCategory = (typeof CallbackCategory)[number];

export const CallbackStatus = ["open", "done"] as const;
export const CallbackStatusSchema = z.enum(CallbackStatus);
export type CallbackStatus = (typeof CallbackStatus)[number];

export const Priority = ["low", "normal", "high", "urgent"] as const;
export const PrioritySchema = z.enum(Priority);
export type Priority = (typeof Priority)[number];

export const Sentiment = ["positive", "neutral", "negative"] as const;
export const SentimentSchema = z.enum(Sentiment);
export type Sentiment = (typeof Sentiment)[number];

export const LanguageMix = ["bn", "en", "mixed"] as const;
export const LanguageMixSchema = z.enum(LanguageMix);
export type LanguageMix = (typeof LanguageMix)[number];

// ---------------------------------------------------------------------------
// Events (call_events.type)
// ---------------------------------------------------------------------------

export const EventType = [
  "call_started",
  "turn_latency",
  "tool_call",
  "tool_result",
  "interruption",
  "silence_prompt",
  "provider_fallback",
  "stt_error",
  "tts_error",
  "llm_error",
  "time_warning",
  "call_ended",
  "finalize_started",
  "finalize_done",
  "finalize_failed",
  "echo_filtered",
  // Added by Lead (SRS 2 section 10): clinic-level, callId is null. Never log the key itself.
  "byok_key_updated",
] as const;
export const EventTypeSchema = z.enum(EventType);
export type EventType = (typeof EventType)[number];

// ---------------------------------------------------------------------------
// Agent and date-time helpers
// ---------------------------------------------------------------------------

/**
 * Parts of day (SRS 2 section 7.5): morning 10:00-12:00, noon 12:00-13:30,
 * afternoon 14:30-17:00, evening 17:00-19:30, night after 19:30.
 */
export const PartOfDay = ["morning", "noon", "afternoon", "evening", "night"] as const;
export const PartOfDaySchema = z.enum(PartOfDay);
export type PartOfDay = (typeof PartOfDay)[number];

/** Problems returned by the date-time resolver (datetime-bn.ts) and checks on slots. */
export const DatetimeProblem = [
  "in_past",
  "closed_friday",
  "outside_hours",
  "prayer_break",
  "unparsed",
  "low_confidence",
] as const;
export const DatetimeProblemSchema = z.enum(DatetimeProblem);
export type DatetimeProblem = (typeof DatetimeProblem)[number];

/** Topics for the get_clinic_info tool. */
export const ClinicInfoTopic = [
  "hours",
  "address",
  "directions",
  "services",
  "fees",
  "doctors",
  "preparation",
  "payment",
  "parking",
] as const;
export const ClinicInfoTopicSchema = z.enum(ClinicInfoTopic);
export type ClinicInfoTopic = (typeof ClinicInfoTopic)[number];

/** Kinds for the flag_off_topic tool (FR-C12). */
export const OffTopicKind = ["irrelevant", "prank", "abuse"] as const;
export const OffTopicKindSchema = z.enum(OffTopicKind);
export type OffTopicKind = (typeof OffTopicKind)[number];

// ---------------------------------------------------------------------------
// Call client (browser)
// ---------------------------------------------------------------------------

/** Visible call states (FR-B3, SRS 2 section 8.1). `listening|thinking|speaking` are live sub-states. */
export const CallUiState = [
  "idle",
  "requesting_mic",
  "connecting",
  "listening",
  "thinking",
  "speaking",
  "ending",
  "ended",
  "error",
] as const;
export const CallUiStateSchema = z.enum(CallUiState);
export type CallUiState = (typeof CallUiState)[number];

/** Mascot animation states (SRS 3 section 4). */
export const MascotState = ["idle", "listening", "thinking", "speaking"] as const;
export const MascotStateSchema = z.enum(MascotState);
export type MascotState = (typeof MascotState)[number];

/** Client events sent instead of caller text on POST /turn. */
export const TurnClientEvent = ["silence", "time_warning"] as const;
export const TurnClientEventSchema = z.enum(TurnClientEvent);
export type TurnClientEvent = (typeof TurnClientEvent)[number];
