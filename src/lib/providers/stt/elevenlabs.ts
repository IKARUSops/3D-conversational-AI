/**
 * ElevenLabs batch speech to text (Scribe) on short VAD clips and on the full call recording.
 * Owner decision O-02: always batch, never the realtime model.
 * API: POST https://api.elevenlabs.io/v1/speech-to-text, multipart, header `xi-api-key`.
 */
import type { SttProvider } from "../types";
import { ensureOk, providerSetting, type FetchLike } from "../common";
import type { BatchFileResult } from "./types";

const URL_STT = "https://api.elevenlabs.io/v1/speech-to-text";

interface ScribeWord {
  text: string;
  start?: number;
  end?: number;
  type?: string;
}
interface ScribeResponse {
  text?: string;
  language_probability?: number;
  words?: ScribeWord[];
}

function form(audio: Blob, filename: string, lang: string): FormData {
  const fd = new FormData();
  fd.append("model_id", providerSetting("ELEVENLABS_STT_MODEL", "scribe_v2"));
  fd.append("file", audio, filename);
  fd.append("language_code", lang === "en" ? "eng" : "ben");
  fd.append("tag_audio_events", "false");
  fd.append("timestamps_granularity", "word");
  return fd;
}

async function call(apiKey: string, fd: FormData, fetchImpl: FetchLike, signal?: AbortSignal): Promise<ScribeResponse> {
  const res = await fetchImpl(URL_STT, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: fd,
    signal,
  });
  await ensureOk("elevenlabs", res);
  return (await res.json()) as ScribeResponse;
}

/** Group words into segments at sentence ends or pauses over 0.8 s. */
export function wordsToSegments(words: ScribeWord[]): BatchFileResult["segments"] {
  const segs: BatchFileResult["segments"] = [];
  let cur: { start: number; end: number; parts: string[] } | null = null;
  for (const w of words) {
    if (w.type === "audio_event") continue;
    const start: number = w.start ?? cur?.end ?? 0;
    const end: number = w.end ?? start;
    if (w.type === "spacing") {
      if (cur) cur.parts.push(w.text);
      continue;
    }
    if (cur && start - cur.end > 0.8) {
      segs.push({ startMs: Math.round(cur.start * 1000), endMs: Math.round(cur.end * 1000), text: cur.parts.join("").trim() });
      cur = null;
    }
    if (!cur) cur = { start, end, parts: [] };
    cur.parts.push(w.text);
    cur.end = end;
    if (/[।?!.]$/.test(w.text)) {
      segs.push({ startMs: Math.round(cur.start * 1000), endMs: Math.round(cur.end * 1000), text: cur.parts.join("").trim() });
      cur = null;
    }
  }
  if (cur) segs.push({ startMs: Math.round(cur.start * 1000), endMs: Math.round(cur.end * 1000), text: cur.parts.join("").trim() });
  return segs.filter((s) => s.text.length > 0);
}

export function createElevenLabsStt(apiKey: string, fetchImpl: FetchLike = fetch): SttProvider & {
  transcribeFile(audio: ArrayBuffer, mimeType: string, signal?: AbortSignal): Promise<BatchFileResult>;
} {
  return {
    id: "elevenlabs",
    async transcribe(wav, opts) {
      const data = await call(apiKey, form(new Blob([wav], { type: "audio/wav" }), "clip.wav", opts.lang), fetchImpl, opts.signal);
      return { text: (data.text ?? "").trim() };
    },
    async transcribeFile(audio, mimeType, signal) {
      const ext = mimeType.includes("webm") ? "webm" : mimeType.includes("wav") ? "wav" : "audio";
      const data = await call(apiKey, form(new Blob([audio], { type: mimeType }), `call.${ext}`, "bn"), fetchImpl, signal);
      const text = (data.text ?? "").trim();
      const segments = data.words?.length ? wordsToSegments(data.words) : text ? [{ startMs: 0, endMs: 0, text }] : [];
      return { text, segments };
    },
  };
}
