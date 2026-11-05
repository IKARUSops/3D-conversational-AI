/**
 * HTTP API contracts (SRS 2 section 5.2). OWNED BY THE LEAD AGENT: do not change without the Lead.
 *
 * Every route validates its input with the matching `...Schema` and returns data that matches
 * the response schema. Errors use `ApiErrorSchema` with an HTTP status from `API_ERROR_STATUS`.
 */
import { z } from "zod";
import {
  CallLangSchema,
  CallStatusSchema,
  EndReasonSchema,
  InputModeSchema,
  KeyProviderSchema,
  ServerSttProviderIdSchema,
  SttProviderIdSchema,
  TtsProviderIdSchema,
  TurnClientEventSchema,
  type SttProviderId,
  type TtsProviderId,
} from "./enums";

// ---------------------------------------------------------------------------
// Limits and shared constants (SRS 2 section 10)
// ---------------------------------------------------------------------------

export const LIMITS = {
  /** Max characters of caller text, TTS text or spoken prefix. */
  TEXT_MAX_CHARS: 1000,
  /** Max STT clip size (wav 16 kHz mono). */
  STT_CLIP_MAX_BYTES: 2 * 1024 * 1024,
  /** Default hard call limit (env MAX_CALL_SECONDS overrides). */
  DEFAULT_MAX_CALL_SECONDS: 300,
  /** Agent wraps up at this second (FR-B9, FR-C20). */
  TIME_WARNING_SECONDS: 270,
  /** Call token lifetime = maxSeconds + this. */
  CALL_TOKEN_GRACE_SECONDS: 120,
  /** Silence prompt after this many ms without caller speech (FR-C16). */
  SILENCE_MS: 7000,
  /** Stale call finalize threshold (SRS 2 section 9 step 10). */
  STALE_CALL_MS: 3 * 60 * 1000,
  /** Signed URL lifetime for recordings. */
  SIGNED_URL_SECONDS: 600,
  /** Portal list page size (FR-D3). */
  PORTAL_PAGE_SIZE: 25,
} as const;

/** Default clinic slug (seed). */
export const DEFAULT_CLINIC_SLUG = "dhaka-dental-care";

/** Private Supabase Storage bucket and path for recordings (SRS 1 section 5.3). */
export const RECORDINGS_BUCKET = "recordings";
export const recordingPath = (clinicId: string, callId: string): string =>
  `clinic/${clinicId}/calls/${callId}.webm`;

/** Response headers. */
export const HEADERS = {
  /** Provider that actually produced the audio/text (after fallback). */
  PROVIDER: "X-Provider",
  /** Set when a fallback happened: the provider that failed. */
  FALLBACK_FROM: "X-Fallback-From",
  /** Request id for logs (NFR-9). */
  REQUEST_ID: "X-Request-Id",
} as const;

const text = z.string().max(LIMITS.TEXT_MAX_CHARS);
const isoDateTime = z.iso.datetime({ offset: true });

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const ApiErrorCode = [
  "invalid_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "call_ended",
  "stale_turn",
  "rate_limited",
  "daily_cap",
  "payload_too_large",
  "provider_unavailable",
  "all_providers_failed",
  "internal",
] as const;
export const ApiErrorCodeSchema = z.enum(ApiErrorCode);
export type ApiErrorCode = (typeof ApiErrorCode)[number];

export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  call_ended: 409,
  stale_turn: 409,
  rate_limited: 429,
  daily_cap: 429,
  payload_too_large: 413,
  provider_unavailable: 503,
  all_providers_failed: 502,
  internal: 500,
};

/** Body of every non-2xx JSON response. `message` is safe to show to the user. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    /** zod issues for invalid_request (development help only). */
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const OkResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/health (public, never cached)
// ---------------------------------------------------------------------------

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  db: z.boolean(),
  ts: isoDateTime,
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/providers (public, no secrets)
// ---------------------------------------------------------------------------

const providerOption = <T extends z.ZodType<string>>(id: T) =>
  z.object({
    id,
    /** Dropdown label, for example "Browser (Chrome, bn-BD)". */
    label: z.string(),
    /** false when no platform key is configured (FR-B2). */
    available: z.boolean(),
    /** Short reason shown when disabled, for example "No key configured". */
    reason: z.string().optional(),
    /** true for the default choice. */
    isDefault: z.boolean().optional(),
  });

export const SttProviderOptionSchema = providerOption(SttProviderIdSchema);
export const TtsProviderOptionSchema = providerOption(TtsProviderIdSchema);
export type SttProviderOption = z.infer<typeof SttProviderOptionSchema>;
export type TtsProviderOption = z.infer<typeof TtsProviderOptionSchema>;

export const ProvidersResponseSchema = z.object({
  stt: z.array(SttProviderOptionSchema),
  tts: z.array(TtsProviderOptionSchema),
});
export type ProvidersResponse = z.infer<typeof ProvidersResponseSchema>;

export const DEFAULT_STT_PROVIDER: SttProviderId = "elevenlabs";
export const DEFAULT_TTS_PROVIDER: TtsProviderId = "elevenlabs";

// ---------------------------------------------------------------------------
// POST /api/calls (public + rate limit) : start a call
// ---------------------------------------------------------------------------

export const StartCallRequestSchema = z.object({
  clinicSlug: z.string().min(1).max(80).default(DEFAULT_CLINIC_SLUG),
  sttProvider: SttProviderIdSchema,
  ttsProvider: TtsProviderIdSchema,
  lang: CallLangSchema.default("bn"),
  userAgent: z.string().max(500).default(""),
  /** Reviewer key from `/?key=` (FR-B12). Skips the per-IP limit when it matches REVIEW_KEY. */
  reviewKey: z.string().max(200).optional(),
});
export type StartCallRequest = z.input<typeof StartCallRequestSchema>;
export type StartCallRequestParsed = z.output<typeof StartCallRequestSchema>;

export const GreetingSchema = z.object({
  /** Readable text for captions and transcript. */
  text: z.string(),
  /** Speakable text for TTS (numbers as Bangla words). */
  ttsText: z.string(),
});
export type Greeting = z.infer<typeof GreetingSchema>;

export const StartCallResponseSchema = z.object({
  callId: z.uuid(),
  /** Send as `Authorization: Bearer <callToken>` on every call API. */
  callToken: z.string(),
  greeting: GreetingSchema,
  /** Hard limit in seconds (FR-B9). */
  maxSeconds: z.number().int().positive(),
  /** Providers actually used (may differ from the request if a key is missing). */
  providers: z.object({ stt: SttProviderIdSchema, tts: TtsProviderIdSchema }),
});
export type StartCallResponse = z.infer<typeof StartCallResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/calls/:id/turn (call token) : SSE response
// ---------------------------------------------------------------------------

export const TurnRequestSchema = z
  .object({
    /** Increases by 1 per turn. The server rejects any turn that is not the latest (stale_turn). */
    turnSeq: z.number().int().nonnegative(),
    /** Caller text (NFC on the server). May be empty only when `event` is set. */
    text: text.default(""),
    inputMode: InputModeSchema,
    sttProvider: SttProviderIdSchema,
    /** 0..1 from Web Speech or the STT provider. */
    sttConfidence: z.number().min(0).max(1).optional(),
    /** Client clock (epoch ms) when the caller finished speaking or pressed send. */
    clientTs: z.number().int().nonnegative(),
    /** `seq` of the agent sentence that the caller interrupted (barge-in, FR-C17). */
    interruptedAgentSeq: z.number().int().nonnegative().optional(),
    /** Agent text actually played before the interruption. */
    spokenPrefix: text.optional(),
    /** Client event instead of caller speech (FR-C16 silence, FR-C20 time warning). */
    event: TurnClientEventSchema.optional(),
    /** Number of caller fragments dropped by the echo filter since the last turn (logged). */
    echoFilteredCount: z.number().int().nonnegative().optional(),
  })
  .refine((t) => t.event !== undefined || t.text.trim().length > 0, {
    message: "text is required unless event is set",
    path: ["text"],
  });
export type TurnRequest = z.input<typeof TurnRequestSchema>;
export type TurnRequestParsed = z.output<typeof TurnRequestSchema>;

/**
 * SSE events from /turn. Wire format: one JSON object per `data:` line, each event followed by
 * a blank line (`data: {...}\n\n`). The client must use fetch() + body.getReader(), not
 * EventSource. Response headers: `Content-Type: text/event-stream`,
 * `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`.
 */
export const TurnEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("sentence"),
    /** Agent sentence number, increasing across the whole call. Used for barge-in reporting. */
    seq: z.number().int().nonnegative(),
    /** Readable text (digits kept) for captions. */
    text: z.string(),
    /** Speakable text for POST /api/tts. */
    ttsText: z.string(),
  }),
  z.object({
    type: z.literal("tool"),
    name: z.string(),
    status: z.enum(["start", "ok", "error"]),
  }),
  z.object({
    /** Short filler such as "একটু দেখে নিচ্ছি"; max one per turn, only before the first sentence. */
    type: z.literal("filler"),
    ttsText: z.string(),
  }),
  z.object({
    /** The agent ended the call; the client ends after the final audio finishes. */
    type: z.literal("end_call"),
    reason: z.string(),
    summary: z.string(),
  }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("done"),
    turnId: z.string(),
    latency: z.object({
      firstTokenMs: z.number().nonnegative(),
      firstSentenceMs: z.number().nonnegative().optional(),
      totalMs: z.number().nonnegative().optional(),
    }),
  }),
]);
export type TurnEvent = z.infer<typeof TurnEventSchema>;
export type TurnEventType = TurnEvent["type"];

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

// ---------------------------------------------------------------------------
// POST /api/stt (call token) : multipart form
// ---------------------------------------------------------------------------

/**
 * Multipart fields besides the `audio` file (wav 16 kHz mono, max LIMITS.STT_CLIP_MAX_BYTES).
 * Parse with `SttFormFieldsSchema.parse(Object.fromEntries(form))` after removing `audio`.
 */
export const SttFormFieldsSchema = z.object({
  provider: ServerSttProviderIdSchema,
  callId: z.uuid(),
  lang: CallLangSchema.default("bn"),
});
export type SttFormFields = z.input<typeof SttFormFieldsSchema>;

export const SttResponseSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  /** Provider that produced the text (after fallback). */
  provider: ServerSttProviderIdSchema,
  /** Server time spent, ms. */
  ms: z.number().nonnegative(),
  /** Set when a fallback happened. */
  fallbackFrom: ServerSttProviderIdSchema.optional(),
});
export type SttResponse = z.infer<typeof SttResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/tts (call token) : returns audio/mpeg stream, header X-Provider
// ---------------------------------------------------------------------------

export const TtsRequestSchema = z.object({
  callId: z.uuid(),
  text: text.min(1),
  provider: TtsProviderIdSchema,
  /** Sentence seq from the SSE `sentence` event (or -1 for greeting/filler). */
  seq: z.number().int().min(-1),
});
export type TtsRequest = z.infer<typeof TtsRequestSchema>;

// ---------------------------------------------------------------------------
// POST /api/calls/:id/recording-url (call token)
// ---------------------------------------------------------------------------

export const RecordingUrlRequestSchema = z.object({
  contentType: z.literal("audio/webm"),
});
export type RecordingUrlRequest = z.infer<typeof RecordingUrlRequestSchema>;

export const RecordingUrlResponseSchema = z.object({
  /** Signed single-use upload URL (direct to Supabase Storage). */
  uploadUrl: z.url(),
  /** Path inside the recordings bucket; send it back in POST /end. */
  path: z.string(),
  /** Upload token from Supabase createSignedUploadUrl (for uploadToSignedUrl). */
  token: z.string().optional(),
});
export type RecordingUrlResponse = z.infer<typeof RecordingUrlResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/calls/:id/end (call token in header OR body for sendBeacon)
// ---------------------------------------------------------------------------

export const EndCallRequestSchema = z.object({
  reason: EndReasonSchema,
  recordingPath: z.string().max(300).optional(),
  /** Call token for navigator.sendBeacon, which cannot set headers (FR-B14). */
  token: z.string().max(1000).optional(),
});
export type EndCallRequest = z.infer<typeof EndCallRequestSchema>;
export const EndCallResponseSchema = OkResponseSchema;
export type EndCallResponse = OkResponse;

// ---------------------------------------------------------------------------
// POST /api/demo-requests (public + rate limit 5/IP/hour)
// ---------------------------------------------------------------------------

export const DemoRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  clinicName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(30),
  email: z.email().max(200).optional().or(z.literal("")),
  message: z.string().trim().max(LIMITS.TEXT_MAX_CHARS).optional(),
});
export type DemoRequest = z.infer<typeof DemoRequestSchema>;
export const DemoRequestResponseSchema = OkResponseSchema;

// ---------------------------------------------------------------------------
// Clinic settings (clinics.settings JSON) : seeded from SRS 1 section 4.4
// ---------------------------------------------------------------------------

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM 24h");

export const ClinicSettingsSchema = z.object({
  /** Open weekdays, JS getDay() numbers (0 = Sunday). Friday (5) is closed. */
  openWeekdays: z.array(z.number().int().min(0).max(6)),
  open: hhmm,
  close: hhmm,
  prayerBreak: z.object({ start: hhmm, end: hhmm }),
  slotMinutes: z.number().int().positive(),
  /** Minimum minutes between now and a bookable slot. */
  leadMinutes: z.number().int().nonnegative(),
  landmarkBn: z.string(),
  landmarkEn: z.string(),
  directionsBn: z.string(),
  directionsEn: z.string(),
  preparationBn: z.string(),
  preparationEn: z.string(),
  paymentBn: z.string(),
  paymentEn: z.string(),
  parkingBn: z.string(),
  parkingEn: z.string(),
  defaultStt: SttProviderIdSchema,
  defaultTts: TtsProviderIdSchema,
});
export type ClinicSettings = z.infer<typeof ClinicSettingsSchema>;

// ---------------------------------------------------------------------------
// Call metrics (calls.metrics JSON), written by finalize
// ---------------------------------------------------------------------------

const stat = z.object({ median: z.number().nullable(), p90: z.number().nullable() });

export const CallMetricsSchema = z.object({
  turns: z.number().int().nonnegative(),
  interruptions: z.number().int().nonnegative(),
  silencePrompts: z.number().int().nonnegative(),
  providerFallbacks: z.number().int().nonnegative(),
  latencyMs: z.object({
    /** Caller end of speech to first LLM token. */
    firstToken: stat,
    /** Caller end of speech to first agent audio (FR-C21). */
    firstAudio: stat,
    /** Server STT time per clip (server STT mode only). */
    stt: stat.optional(),
  }),
});
export type CallMetrics = z.infer<typeof CallMetricsSchema>;

/** Payload of the `turn_latency` call event (NFR-2). */
export const TurnLatencyPayloadSchema = z.object({
  turnSeq: z.number().int(),
  tSpeechEnd: z.number().optional(),
  firstTokenMs: z.number().optional(),
  firstSentenceMs: z.number().optional(),
  firstAudioMs: z.number().optional(),
  sttMs: z.number().optional(),
  totalMs: z.number().optional(),
});
export type TurnLatencyPayload = z.infer<typeof TurnLatencyPayloadSchema>;

/** Payload of the `provider_fallback` call event. */
export const ProviderFallbackPayloadSchema = z.object({
  kind: z.enum(["stt", "tts", "llm"]),
  from: z.string(),
  to: z.string(),
  reason: z.string(),
});
export type ProviderFallbackPayload = z.infer<typeof ProviderFallbackPayloadSchema>;

// ---------------------------------------------------------------------------
// Portal (staff session). Prefer server components; these cover the few JSON/actions needed.
// ---------------------------------------------------------------------------

/** Query string of /portal/calls (FR-D3). */
export const CallsListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: CallStatusSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  stt: SttProviderIdSchema.optional(),
  tts: TtsProviderIdSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type CallsListQuery = z.infer<typeof CallsListQuerySchema>;

/** Mark a callback done (FR-D10). */
export const CallbackDoneRequestSchema = z.object({
  callbackId: z.uuid(),
  note: z.string().trim().max(LIMITS.TEXT_MAX_CHARS).optional(),
});
export type CallbackDoneRequest = z.infer<typeof CallbackDoneRequestSchema>;

/** Save or replace a BYOK key (FR-D13, admin only, not read-only). */
export const ProviderKeyUpsertRequestSchema = z.object({
  provider: KeyProviderSchema,
  key: z.string().trim().min(8).max(500),
  /** Azure only, for example "southeastasia". */
  region: z.string().trim().max(50).optional(),
});
export type ProviderKeyUpsertRequest = z.infer<typeof ProviderKeyUpsertRequestSchema>;

/** What the browser may see about a stored key: never the key itself. */
export const ProviderKeyViewSchema = z.object({
  provider: KeyProviderSchema,
  last4: z.string(),
  validatedAt: isoDateTime.nullable(),
  region: z.string().optional(),
  updatedAt: isoDateTime,
});
export type ProviderKeyView = z.infer<typeof ProviderKeyViewSchema>;

export const ProviderKeyTestResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string().optional(),
});
export type ProviderKeyTestResponse = z.infer<typeof ProviderKeyTestResponseSchema>;
