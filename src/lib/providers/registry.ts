/**
 * Provider registry and fallback chains (SRS 2 section 7.7, owner decisions O-03, O-04, O-05).
 *
 * - The chain starts at the provider the caller picked and walks TTS_FALLBACK_ORDER /
 *   SERVER_STT_FALLBACK_ORDER; providers before it are not used.
 * - Timeouts: STT 8 s per provider, TTS 4 s to first byte, LLM 4 s to first token (turn.ts).
 * - Each switch logs `provider_fallback {kind, from, to, reason}` via logEvent.
 */
import "server-only";
import {
  SERVER_STT_FALLBACK_ORDER,
  TTS_FALLBACK_ORDER,
  type CallLang,
  type KeySource,
  type ProvidersResponse,
  type ServerSttProviderId,
  type TtsProviderId,
} from "@/contracts";
import { optionalServerEnv } from "@/lib/env";
import { logEvent } from "@/lib/services";
import { errorReason, ProviderError, type FetchLike } from "./common";
import { platformKey, resolveKey, type KeyResolver } from "./keys";
import { createGoogleLlm } from "./llm/google";
import { createOpenAiLlm } from "./llm/openai";
import type { LlmHandle } from "./llm/types";
import { createAzureStt } from "./stt/azure";
import { createElevenLabsStt } from "./stt/elevenlabs";
import { createOpenAiStt } from "./stt/openai";
import type { BatchFileResult } from "./stt/types";
import { createAzureTts } from "./tts/azure";
import { createElevenLabsTts } from "./tts/elevenlabs";
import { createOpenAiTts } from "./tts/openai";
import { PROVIDER_TIMEOUTS_MS, type ResolvedKey, type SttProvider, type TtsProvider } from "./types";

export interface RegistryDeps {
  resolveKey?: KeyResolver;
  fetchImpl?: FetchLike;
  log?: typeof logEvent;
  timeouts?: { stt?: number; ttsFirstByte?: number; llmFirstToken?: number; sttFile?: number };
}

type FileStt = SttProvider & {
  transcribeFile(audio: ArrayBuffer, mimeType: string, signal?: AbortSignal): Promise<BatchFileResult>;
};

export class AllProvidersFailedError extends Error {
  constructor(
    public readonly kind: "stt" | "tts" | "llm",
    public readonly reasons: string[],
  ) {
    super(`All ${kind} providers failed: ${reasons.join(" | ")}`);
    this.name = "AllProvidersFailedError";
  }
}

const region = (key: ResolvedKey) => key.meta?.region ?? optionalServerEnv().AZURE_SPEECH_REGION;

export function buildStt(id: ServerSttProviderId, key: ResolvedKey, fetchImpl?: FetchLike): FileStt {
  switch (id) {
    case "elevenlabs":
      return createElevenLabsStt(key.value, fetchImpl);
    case "openai":
      return createOpenAiStt(key.value, fetchImpl);
    case "azure":
      return createAzureStt(key.value, region(key), fetchImpl);
  }
}

export function buildTts(id: TtsProviderId, key: ResolvedKey, fetchImpl?: FetchLike): TtsProvider {
  switch (id) {
    case "elevenlabs":
      return createElevenLabsTts({ apiKey: key.value, fetchImpl });
    case "openai":
      return createOpenAiTts(key.value, fetchImpl);
    case "azure":
      return createAzureTts(key.value, region(key), fetchImpl);
  }
}

/** Order of providers to try, starting at `start`. */
export function chainFrom<T extends string>(order: readonly T[], start: T): T[] {
  const i = order.indexOf(start);
  return i < 0 ? [...order] : order.slice(i);
}

async function logFallback(deps: RegistryDeps, callId: string | undefined, kind: "stt" | "tts" | "llm", from: string, to: string, reason: string) {
  if (!callId) return;
  await (deps.log ?? logEvent)(callId, "provider_fallback", { kind, from, to, reason });
}

async function availableChain<T extends ServerSttProviderId | TtsProviderId>(
  order: T[],
  clinicId: string | undefined,
  deps: RegistryDeps,
): Promise<Array<{ id: T; key: ResolvedKey }>> {
  const resolver = deps.resolveKey ?? resolveKey;
  const out: Array<{ id: T; key: ResolvedKey }> = [];
  for (const id of order) {
    const key = await resolver(id, clinicId);
    if (key) out.push({ id, key });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Account errors (401/402/403): the provider will keep failing for this key, so skip it for a
// while instead of paying the round trip on every sentence (TC-02: ElevenLabs 402 on a free plan).
// Per warm server instance; the client also sticks to the provider that worked.
// ---------------------------------------------------------------------------
const ACCOUNT_BLOCK_MS = 10 * 60_000;
const accountBlocked = new Map<string, number>();

function blockKey(id: string, key: ResolvedKey): string {
  return `${id}:${key.source}:${key.value.slice(-8)}`;
}
export function isAccountError(err: unknown): boolean {
  return err instanceof ProviderError && (err.status === 401 || err.status === 402 || err.status === 403);
}
export function isAccountBlocked(id: string, key: ResolvedKey, now = Date.now()): boolean {
  const until = accountBlocked.get(blockKey(id, key));
  if (until === undefined) return false;
  if (until <= now) {
    accountBlocked.delete(blockKey(id, key));
    return false;
  }
  return true;
}
export function blockAccount(id: string, key: ResolvedKey, now = Date.now()): void {
  accountBlocked.set(blockKey(id, key), now + ACCOUNT_BLOCK_MS);
}
/** Tests only. */
export function clearAccountBlocks(): void {
  accountBlocked.clear();
}

async function withTimeout<T>(ms: number, parent: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort(parent?.reason);
  if (parent?.aborted) ctrl.abort(parent.reason);
  parent?.addEventListener("abort", onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(ctrl.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctrl.abort(new Error("timeout"));
          reject(new Error(`timeout after ${ms} ms`));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onAbort);
  }
}

// ---------------------------------------------------------------------------
// STT
// ---------------------------------------------------------------------------

export interface SttRunResult {
  text: string;
  confidence?: number;
  provider: ServerSttProviderId;
  keySource: KeySource;
  fallbackFrom?: ServerSttProviderId;
  ms: number;
}

/** Transcribe a short WAV clip with fallback (POST /api/stt). */
export async function transcribeClipWithFallback(
  input: { wav: ArrayBuffer; lang: CallLang; start: ServerSttProviderId; clinicId?: string; callId?: string; signal?: AbortSignal },
  deps: RegistryDeps = {},
): Promise<SttRunResult> {
  const t0 = Date.now();
  const allStt = await availableChain(chainFrom(SERVER_STT_FALLBACK_ORDER, input.start), input.clinicId, deps);
  // Skip a provider that rejected the account recently (no credits), like TTS (TC-13).
  const usableStt = allStt.filter((p) => !isAccountBlocked(`stt-${p.id}`, p.key));
  const chain = usableStt.length > 0 ? usableStt : allStt;
  if (chain.length === 0) throw new AllProvidersFailedError("stt", ["no provider key configured"]);
  const reasons: string[] = [];
  for (let i = 0; i < chain.length; i++) {
    const { id, key } = chain[i]!;
    try {
      const stt = buildStt(id, key, deps.fetchImpl);
      const r = await withTimeout(deps.timeouts?.stt ?? PROVIDER_TIMEOUTS_MS.stt, input.signal, (signal) =>
        stt.transcribe(input.wav, { lang: input.lang, signal }),
      ).catch((err: unknown) => {
        if (isAccountError(err)) blockAccount(`stt-${id}`, key);
        throw err;
      });
      return {
        ...r,
        provider: id,
        keySource: key.source,
        ...(i > 0 ? { fallbackFrom: chain[0]!.id } : {}),
        ms: Date.now() - t0,
      };
    } catch (err) {
      if (input.signal?.aborted) throw err;
      const reason = errorReason(err);
      reasons.push(`${id}: ${reason}`);
      const next = chain[i + 1];
      if (next) await logFallback(deps, input.callId, "stt", id, next.id, reason);
    }
  }
  throw new AllProvidersFailedError("stt", reasons);
}

/** Transcribe a whole recording (post-call). ElevenLabs, then OpenAI, then Azure. */
export async function transcribeFileWithFallback(
  input: { audio: ArrayBuffer; mimeType: string; clinicId?: string; callId?: string },
  deps: RegistryDeps = {},
): Promise<(BatchFileResult & { provider: ServerSttProviderId }) | null> {
  const chain = await availableChain([...SERVER_STT_FALLBACK_ORDER], input.clinicId, deps);
  for (let i = 0; i < chain.length; i++) {
    const { id, key } = chain[i]!;
    try {
      const stt = buildStt(id, key, deps.fetchImpl);
      const r = await withTimeout(deps.timeouts?.sttFile ?? 60_000, undefined, (signal) =>
        stt.transcribeFile(input.audio, input.mimeType, signal),
      );
      return { ...r, provider: id };
    } catch (err) {
      const next = chain[i + 1];
      if (next) await logFallback(deps, input.callId, "stt", id, next.id, errorReason(err));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// TTS
// ---------------------------------------------------------------------------

export interface TtsRunResult {
  stream: ReadableStream<Uint8Array>;
  provider: TtsProviderId;
  keySource: KeySource;
  fallbackFrom?: TtsProviderId;
}

/**
 * Start TTS with fallback. A provider counts as working only after its first audio byte
 * arrived within 4 s; after that the stream is passed through as is.
 */
export async function synthesizeWithFallback(
  input: { text: string; lang: CallLang; start: TtsProviderId; clinicId?: string; callId?: string; signal?: AbortSignal },
  deps: RegistryDeps = {},
): Promise<TtsRunResult> {
  const all = await availableChain(chainFrom(TTS_FALLBACK_ORDER, input.start), input.clinicId, deps);
  const usable = all.filter((p) => !isAccountBlocked(p.id, p.key));
  // If every provider is blocked, try them all anyway (the block may be out of date).
  const chain = usable.length > 0 ? usable : all;
  if (chain.length === 0) throw new AllProvidersFailedError("tts", ["no provider key configured"]);
  const reasons: string[] = [];
  const firstByteMs = deps.timeouts?.ttsFirstByte ?? PROVIDER_TIMEOUTS_MS.ttsFirstByte;

  for (let i = 0; i < chain.length; i++) {
    const { id, key } = chain[i]!;
    const ctrl = new AbortController();
    const onParentAbort = () => ctrl.abort(input.signal?.reason);
    input.signal?.addEventListener("abort", onParentAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const tts = buildTts(id, key, deps.fetchImpl);
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctrl.abort(new Error("first byte timeout"));
          reject(new ProviderError(id, `no audio within ${firstByteMs} ms`));
        }, firstByteMs);
      });
      const first = await Promise.race([
        (async () => {
          const body = await tts.stream(input.text, { lang: input.lang, signal: ctrl.signal });
          const reader = body.getReader();
          const chunk = await reader.read();
          if (chunk.done || !chunk.value || chunk.value.byteLength === 0) {
            throw new ProviderError(id, "empty audio");
          }
          return { reader, chunk: chunk.value };
        })(),
        timeout,
      ]);
      clearTimeout(timer);
      const { reader, chunk } = first;
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(chunk);
        },
        async pull(c) {
          try {
            const r = await reader.read();
            if (r.done) {
              input.signal?.removeEventListener("abort", onParentAbort);
              c.close();
            } else c.enqueue(r.value);
          } catch (err) {
            c.error(err);
          }
        },
        cancel(reason) {
          input.signal?.removeEventListener("abort", onParentAbort);
          ctrl.abort(reason);
          return reader.cancel(reason).catch(() => undefined);
        },
      });
      return {
        stream,
        provider: id,
        keySource: key.source,
        ...(i > 0 ? { fallbackFrom: chain[0]!.id } : {}),
      };
    } catch (err) {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onParentAbort);
      ctrl.abort(err);
      if (input.signal?.aborted) throw err;
      const reason = errorReason(err);
      if (isAccountError(err)) blockAccount(id, key);
      reasons.push(`${id}: ${reason}`);
      const next = chain[i + 1];
      if (next) await logFallback(deps, input.callId, "tts", id, next.id, reason);
    }
  }
  throw new AllProvidersFailedError("tts", reasons);
}

// ---------------------------------------------------------------------------
// LLM
// ---------------------------------------------------------------------------

/** Parse "google:gemini-2.5-flash" into a model handle, or null if its key is missing. */
export function llmFromSpec(spec: string): LlmHandle | null {
  const env = optionalServerEnv();
  const [vendor, ...rest] = spec.split(":");
  const modelId = rest.join(":");
  if (!modelId) return null;
  if (vendor === "google" && env.GOOGLE_GENERATIVE_AI_API_KEY) return createGoogleLlm(modelId, env.GOOGLE_GENERATIVE_AI_API_KEY);
  if (vendor === "openai" && env.OPENAI_API_KEY) return createOpenAiLlm(modelId, env.OPENAI_API_KEY);
  return null;
}

/** Primary then fallback LLM (only those with a key). */
export function getLlmChain(): LlmHandle[] {
  const env = optionalServerEnv();
  return [env.LLM_PRIMARY, env.LLM_FALLBACK]
    .filter((s, i, a) => a.indexOf(s) === i)
    .map(llmFromSpec)
    .filter((x): x is LlmHandle => x !== null);
}

// ---------------------------------------------------------------------------
// Availability for GET /api/providers (platform keys only; no secrets)
// ---------------------------------------------------------------------------

const STT_LABELS: Record<"browser" | ServerSttProviderId, string> = {
  browser: "Browser (Chrome, bn-BD)",
  elevenlabs: "ElevenLabs Scribe",
  openai: "OpenAI",
  azure: "Azure (bn-IN)",
};
const TTS_LABELS: Record<TtsProviderId, string> = {
  elevenlabs: "ElevenLabs (Nadia)",
  openai: "OpenAI",
  azure: "Azure (bn-BD Nabanita)",
};

export function providerAvailability(): ProvidersResponse {
  const has = (id: ServerSttProviderId | TtsProviderId) => platformKey(id) !== null;
  const reason = "No key configured";
  return {
    // Owner decision T-20: server STT first (ElevenLabs, OpenAI, Azure), Chrome's recognizer last.
    stt: (() => {
      const firstServer = SERVER_STT_FALLBACK_ORDER.find((id) => has(id));
      return [
        ...SERVER_STT_FALLBACK_ORDER.map((id) => ({
          id,
          label: STT_LABELS[id],
          available: has(id),
          ...(id === firstServer ? { isDefault: true } : {}),
          ...(has(id) ? {} : { reason }),
        })),
        { id: "browser" as const, label: STT_LABELS.browser, available: true, ...(firstServer ? {} : { isDefault: true }) },
      ];
    })(),
    tts: TTS_FALLBACK_ORDER.map((id) => ({
      id,
      label: TTS_LABELS[id],
      available: has(id),
      ...(has(id) ? {} : { reason }),
      ...(id === "elevenlabs" ? { isDefault: true } : {}),
    })),
  };
}
