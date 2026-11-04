/**
 * Provider interfaces (SRS 2 section 7.7). Agent B owns this folder and may extend these.
 * Adapters: stt/{elevenlabs,openai,azure}.ts, tts/{elevenlabs,openai,azure}.ts, llm/{google,openai}.ts.
 * Registry (registry.ts): pick provider, fallback chain (see TTS_FALLBACK_ORDER and
 * SERVER_STT_FALLBACK_ORDER in @/contracts), key source (BYOK first, then platform env).
 */
import type { CallLang, KeySource, ServerSttProviderId, TtsProviderId } from "@/contracts";

export interface SttProvider {
  id: ServerSttProviderId;
  transcribe(
    wav: ArrayBuffer,
    opts: { lang: CallLang; keywords?: string[]; signal?: AbortSignal },
  ): Promise<{ text: string; confidence?: number }>;
}

export interface TtsProvider {
  id: TtsProviderId;
  /** Returns an audio/mpeg stream. */
  stream(
    text: string,
    opts: { lang: CallLang; signal?: AbortSignal },
  ): Promise<ReadableStream<Uint8Array>>;
}

export interface ResolvedKey {
  value: string;
  source: KeySource;
  /** Azure region etc. */
  meta?: Record<string, string>;
}

/** Timeouts before moving to the next provider (SRS 2 section 7.7). */
export const PROVIDER_TIMEOUTS_MS = {
  stt: 8000,
  ttsFirstByte: 4000,
  llmFirstToken: 4000,
} as const;
