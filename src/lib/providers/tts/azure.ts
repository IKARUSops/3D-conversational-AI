/**
 * Azure TTS (final fallback): SSML with bn-BD-NabanitaNeural, mp3.
 * POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1
 */
import type { TtsProvider } from "../types";
import { ensureOk, escapeXml, ProviderError, type FetchLike } from "../common";

export function buildSsml(text: string, lang: "bn" | "en"): string {
  const voice = lang === "en" ? "en-IN-NeerjaNeural" : "bn-BD-NabanitaNeural";
  const xmlLang = lang === "en" ? "en-IN" : "bn-BD";
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${xmlLang}"><voice name="${voice}">${escapeXml(text)}</voice></speak>`;
}

export function createAzureTts(apiKey: string, region: string, fetchImpl: FetchLike = fetch): TtsProvider {
  return {
    id: "azure",
    async stream(text, opts) {
      const res = await fetchImpl(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": apiKey,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "bytevoice-bangla",
        },
        body: buildSsml(text, opts.lang),
        signal: opts.signal,
      });
      await ensureOk("azure", res);
      if (!res.body) throw new ProviderError("azure", "empty body");
      return res.body;
    },
  };
}
