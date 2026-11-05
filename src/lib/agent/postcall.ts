/**
 * Post-call ports: Agent B implements, Agent A's finalize.ts calls them (SRS 2 section 9).
 * Owner: Lead. Do not change these signatures; replace the bodies.
 */
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  CallbackCategorySchema,
  IntentSchema,
  LanguageMixSchema,
  SentimentSchema,
  ServiceCodeSchema,
  type AgentState,
  type CallbackCategory,
  type Intent,
} from "@/contracts";
import type { ClinicContext } from "@/lib/services";
import { PART_WINDOWS, dhakaIso, todayInfo } from "@/lib/text/datetime-bn";
import { summarizeState } from "./state";

export interface BatchTranscript {
  provider: "elevenlabs" | "openai" | "azure";
  text: string;
  /** Times are ms from the start of the recording (finalize shifts them to call time). */
  segments: Array<{ startMs: number; endMs: number; text: string }>;
}

export interface LiveTurn {
  seq: number;
  speaker: "agent" | "caller" | "system";
  text: string;
  /** ms from call start */
  startedMs: number;
}

/** Structured fields for call_extractions plus summaries. Values the code already confirmed win. */
export interface CallExtraction {
  intent: Intent;
  patientNameBn: string | null;
  patientNameEn: string | null;
  phoneRaw: string | null;
  reasonForVisit: string | null;
  serviceCode: string | null;
  doctorRequested: string | null;
  preferredDatetimeText: string | null;
  /** ISO, resolved by code (agent state) when available. */
  preferredDatetime: string | null;
  callerConfirmed: boolean;
  sentiment: "positive" | "neutral" | "negative" | null;
  languageMix: "bn" | "en" | "mixed";
  callbackCategory: CallbackCategory | null;
  /** Caller turns that were off-topic or prank (post-call LLM count; spam safety net, TC-11). */
  offTopicTurns?: number;
  summaryBn: string;
  summaryEn: string;
  /** 0..1 per field name. */
  fieldConfidence: Record<string, number>;
  model: string;
}

/**
 * Transcribe the caller recording with batch STT (ElevenLabs, then OpenAI, then Azure).
 * Returns null if every provider fails. Must not throw.
 */
export async function transcribeRecording(
  audio: ArrayBuffer,
  mimeType: string,
  clinicId: string,
): Promise<BatchTranscript | null> {
  try {
    const { transcribeFileWithFallback } = await import("@/lib/providers/registry");
    const r = await transcribeFileWithFallback({ audio, mimeType, clinicId });
    if (!r) return null;
    return {
      provider: r.provider,
      text: r.text.normalize("NFC"),
      segments: r.segments.map((s) => ({ ...s, text: s.text.normalize("NFC") })),
    };
  } catch (err) {
    console.error("[postcall] transcribeRecording", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

const conf = z.number().min(0).max(1).nullable();

/** Schema given to the LLM: no records/maps (Gemini structured output dislikes them). */
export const LlmExtractionSchema = z.object({
  intent: IntentSchema,
  patientNameBn: z.string().nullable(),
  patientNameEn: z.string().nullable(),
  phoneRaw: z.string().nullable().describe("Digits only"),
  reasonForVisit: z.string().nullable(),
  serviceCode: ServiceCodeSchema.nullable(),
  doctorRequested: z.string().nullable(),
  preferredDatetimeText: z.string().nullable().describe("The caller's own words for the day/time"),
  callerConfirmed: z.boolean(),
  sentiment: SentimentSchema,
  languageMix: LanguageMixSchema,
  callbackCategory: CallbackCategorySchema.nullable(),
  offTopicTurns: z
    .number()
    .int()
    .min(0)
    .describe("How many caller turns were irrelevant, prank or personal questions not about the clinic or teeth"),
  summaryBn: z.string().describe("2 or 3 short Bangla sentences"),
  summaryEn: z.string().describe("2 or 3 short English sentences"),
  confidence: z.object({
    intent: conf,
    patientName: conf,
    phone: conf,
    reasonForVisit: conf,
    serviceCode: conf,
    preferredDatetime: conf,
  }),
});
export type LlmExtraction = z.infer<typeof LlmExtractionSchema>;

/** Preferred datetime from code-resolved state: chosen slot, else the resolved window. */
export function stateDatetime(state: AgentState): string | null {
  if (state.chosenSlot) return state.chosenSlot;
  const w = state.requestedWindow;
  if (!w?.resolvedDate) return null;
  if (w.time) return dhakaIso(w.resolvedDate, w.time);
  if (w.partOfDay) {
    const m = PART_WINDOWS[w.partOfDay][0];
    return dhakaIso(w.resolvedDate, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return null;
}

/** Merge LLM output with tool-confirmed state (state wins). Pure, tested. */
export function mergeExtraction(llm: LlmExtraction, state: AgentState, model: string): CallExtraction {
  const fieldConfidence: Record<string, number> = {};
  for (const [k, v] of Object.entries(llm.confidence)) if (typeof v === "number") fieldConfidence[k] = v;
  const nameBn = state.patient?.nameBn ?? llm.patientNameBn;
  const nameEn = state.patient?.nameEn ?? llm.patientNameEn;
  if (state.patient?.nameConfirmed) fieldConfidence.patientName = 1;
  const phone = state.phone?.raw ?? (llm.phoneRaw ? llm.phoneRaw.replace(/\D/g, "") : null);
  if (state.phone?.confirmed) fieldConfidence.phone = 1;
  const dt = stateDatetime(state);
  if (dt) fieldConfidence.preferredDatetime = 1;
  const intent: Intent = state.intent && state.intent !== "unknown" ? state.intent : llm.intent;
  return {
    intent,
    patientNameBn: nameBn ?? null,
    patientNameEn: nameEn ?? null,
    phoneRaw: phone || null,
    reasonForVisit: state.reason ?? llm.reasonForVisit,
    serviceCode: state.serviceCode ?? llm.serviceCode,
    doctorRequested: llm.doctorRequested,
    preferredDatetimeText: state.requestedWindow?.phrase ?? llm.preferredDatetimeText,
    preferredDatetime: dt,
    callerConfirmed: Boolean(state.appointmentId) || llm.callerConfirmed,
    sentiment: llm.sentiment,
    languageMix: llm.languageMix,
    callbackCategory: llm.callbackCategory,
    offTopicTurns: llm.offTopicTurns,
    summaryBn: llm.summaryBn.normalize("NFC"),
    summaryEn: llm.summaryEn,
    fieldConfidence,
    model,
  };
}

export function extractionPrompt(input: {
  liveTurns: LiveTurn[];
  batchCallerText: string | null;
  agentState: AgentState;
  clinic: ClinicContext;
  now: Date;
}): string {
  const t = todayInfo(input.now);
  const transcript = input.liveTurns
    .filter((x) => x.speaker !== "system")
    .map((x) => `[${x.speaker}] ${x.text}`)
    .join("\n");
  return [
    `Extract structured data from a phone call to ${input.clinic.nameEn}, a dental clinic in Dhaka. Today is ${t.iso} (Asia/Dhaka).`,
    "Rules: values confirmed by tools (below) are correct; prefer them over the transcript. Use null when unknown.",
    "Never invent a name, phone or date. Service codes: " + input.clinic.services.map((s) => `${s.code} (${s.nameEn})`).join(", ") + ".",
    "intent: book / reschedule / cancel / enquiry (questions only) / callback (wants staff to call) / other / unknown.",
    "callbackCategory only when the caller needs a staff callback: emergency symptoms (bleeding that will not stop, face swelling with fever, trouble breathing) = urgent; a medical question (medicine, diagnosis) = medical; complaint, billing, wants a human = complaint / billing / human_request.",
    "",
    "TOOL-CONFIRMED STATE",
    summarizeState(input.agentState, input.clinic),
    "",
    "LIVE TRANSCRIPT (browser speech recognition, may contain errors)",
    transcript || "(empty)",
    "",
    "RE-TRANSCRIBED CALLER AUDIO (more accurate for the caller's words; may also contain the agent's voice)",
    input.batchCallerText || "(none)",
  ].join("\n");
}

/**
 * LLM structured-output extraction (primary LLM, then fallback). Prefer agentState values
 * (tool-confirmed) over transcript guesses. Throws only if every LLM fails.
 */
export async function extractCallFields(input: {
  liveTurns: LiveTurn[];
  batchCallerText: string | null;
  agentState: AgentState;
  clinic: ClinicContext;
  now: Date;
}): Promise<CallExtraction> {
  const { getLlmChain } = await import("@/lib/providers/registry");
  const llms = getLlmChain();
  if (llms.length === 0) throw new Error("extractCallFields: no LLM configured");
  const prompt = extractionPrompt(input);
  const errors: string[] = [];
  for (const llm of llms) {
    try {
      const r = await generateText({
        model: llm.model,
        prompt,
        output: Output.object({ schema: LlmExtractionSchema, name: "call_extraction" }),
        temperature: 0,
        maxRetries: 1,
        timeout: 30_000,
        providerOptions: llm.providerOptions as never,
      });
      const parsed = LlmExtractionSchema.parse(r.output);
      return mergeExtraction(parsed, input.agentState, llm.id);
    } catch (err) {
      errors.push(`${llm.id}: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
    }
  }
  throw new Error(`extractCallFields: all LLMs failed (${errors.join(" | ")})`);
}

/** Optional (Could): translate turn texts to English in one call. Returns same length array, or null. */
export async function translateTurnsToEnglish(texts: string[]): Promise<string[] | null> {
  if (texts.length === 0) return [];
  try {
    const { getLlmChain } = await import("@/lib/providers/registry");
    const llm = getLlmChain()[0];
    if (!llm) return null;
    const r = await generateText({
      model: llm.model,
      prompt: [
        "Translate each numbered line from Bangla (or mixed Bangla/English) to natural English.",
        `Return exactly ${texts.length} translations in the same order.`,
        ...texts.map((t, i) => `${i + 1}. ${t}`),
      ].join("\n"),
      output: Output.object({ schema: z.object({ translations: z.array(z.string()) }) }),
      temperature: 0,
      maxRetries: 1,
      timeout: 30_000,
      providerOptions: llm.providerOptions as never,
    });
    const out = (r.output as { translations?: string[] } | undefined)?.translations;
    return out && out.length === texts.length ? out : null;
  } catch (err) {
    console.error("[postcall] translate", err);
    return null;
  }
}
