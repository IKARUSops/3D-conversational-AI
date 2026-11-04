/**
 * Azure Speech to text. Azure has no bn-BD STT, only bn-IN (owner STT test, see docs/DECISIONS.md).
 * - Clips: REST "short audio" API (max 60 s, WAV PCM 16 kHz mono), format=detailed.
 * - Recording (post-call): "fast transcription" API, which accepts WebM (verify on deploy).
 */
import type { SttProvider } from "../types";
import { ensureOk, type FetchLike } from "../common";
import type { BatchFileResult } from "./types";

interface ShortAudioResponse {
  RecognitionStatus?: string;
  DisplayText?: string;
  NBest?: Array<{ Confidence?: number; Display?: string }>;
}

interface FastResponse {
  combinedPhrases?: Array<{ text?: string }>;
  phrases?: Array<{ offsetMilliseconds?: number; durationMilliseconds?: number; text?: string }>;
}

export function createAzureStt(
  apiKey: string,
  region: string,
  fetchImpl: FetchLike = fetch,
): SttProvider & {
  transcribeFile(audio: ArrayBuffer, mimeType: string, signal?: AbortSignal): Promise<BatchFileResult>;
} {
  return {
    id: "azure",
    async transcribe(wav, opts) {
      const lang = opts.lang === "en" ? "en-US" : "bn-IN";
      const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${lang}&format=detailed`;
      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": apiKey,
          "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
          Accept: "application/json",
        },
        body: wav,
        signal: opts.signal,
      });
      await ensureOk("azure", res);
      const data = (await res.json()) as ShortAudioResponse;
      if (data.RecognitionStatus && data.RecognitionStatus !== "Success") {
        // NoMatch / InitialSilenceTimeout: no speech, not a provider failure.
        return { text: "" };
      }
      const best = data.NBest?.[0];
      return { text: (best?.Display ?? data.DisplayText ?? "").trim(), confidence: best?.Confidence };
    },
    async transcribeFile(audio, mimeType, signal) {
      const url = `https://${region}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15`;
      const fd = new FormData();
      fd.append("audio", new Blob([audio], { type: mimeType }), "call.webm");
      fd.append("definition", JSON.stringify({ locales: ["bn-IN"] }));
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": apiKey },
        body: fd,
        signal,
      });
      await ensureOk("azure", res);
      const data = (await res.json()) as FastResponse;
      const segments = (data.phrases ?? [])
        .filter((p) => p.text)
        .map((p) => ({
          startMs: p.offsetMilliseconds ?? 0,
          endMs: (p.offsetMilliseconds ?? 0) + (p.durationMilliseconds ?? 0),
          text: (p.text ?? "").trim(),
        }));
      const text = (data.combinedPhrases?.[0]?.text ?? segments.map((s) => s.text).join(" ")).trim();
      return { text, segments };
    },
  };
}
