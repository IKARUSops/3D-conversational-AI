/**
 * OpenAI speech to text: POST https://api.openai.com/v1/audio/transcriptions (multipart).
 * Model from env OPENAI_STT_MODEL, default `gpt-transcribe` (listed in @ai-sdk/openai types;
 * older gpt-4o-transcribe models shut down 2027-02-26, see docs/DECISIONS.md). (verify on deploy)
 */
import type { SttProvider } from "../types";
import { CLINIC_KEYWORDS, ensureOk, providerSetting, type FetchLike } from "../common";
import type { BatchFileResult } from "./types";

const URL_STT = "https://api.openai.com/v1/audio/transcriptions";

function prompt(): string {
  return `Dhaka dental clinic phone call in Bangladeshi Bangla with some English words: ${CLINIC_KEYWORDS.join(", ")}.`;
}

async function call(
  apiKey: string,
  audio: Blob,
  filename: string,
  lang: string,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<string> {
  const fd = new FormData();
  fd.append("file", audio, filename);
  fd.append("model", providerSetting("OPENAI_STT_MODEL", "gpt-transcribe"));
  fd.append("language", lang === "en" ? "en" : "bn");
  fd.append("prompt", prompt());
  fd.append("response_format", "json");
  const res = await fetchImpl(URL_STT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
    signal,
  });
  await ensureOk("openai", res);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

export function createOpenAiStt(apiKey: string, fetchImpl: FetchLike = fetch): SttProvider & {
  transcribeFile(audio: ArrayBuffer, mimeType: string, signal?: AbortSignal): Promise<BatchFileResult>;
} {
  return {
    id: "openai",
    async transcribe(wav, opts) {
      const text = await call(apiKey, new Blob([wav], { type: "audio/wav" }), "clip.wav", opts.lang, fetchImpl, opts.signal);
      return { text };
    },
    async transcribeFile(audio, mimeType, signal) {
      const text = await call(apiKey, new Blob([audio], { type: mimeType }), "call.webm", "bn", fetchImpl, signal);
      // No timestamps with response_format=json: one block.
      return { text, segments: text ? [{ startMs: 0, endMs: 0, text }] : [] };
    },
  };
}
