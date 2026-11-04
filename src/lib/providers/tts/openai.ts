/**
 * OpenAI TTS: POST https://api.openai.com/v1/audio/speech, model `gpt-4o-mini-tts`
 * (OPENAI_TTS_MODEL), female voice (OPENAI_TTS_VOICE, default "coral"), mp3, with `instructions`.
 */
import type { TtsProvider } from "../types";
import { ensureOk, providerSetting, ProviderError, type FetchLike } from "../common";

export const OPENAI_TTS_INSTRUCTIONS_BN =
  "Speak as a warm, polite young female receptionist from Dhaka, Bangladesh. Natural Bangladeshi Bangla accent (not Kolkata), calm, medium pace, friendly.";
export const OPENAI_TTS_INSTRUCTIONS_EN =
  "Speak as a warm, polite young female receptionist from Dhaka, Bangladesh, in clear simple English with a light Bangladeshi accent. Calm, medium pace.";

export function createOpenAiTts(apiKey: string, fetchImpl: FetchLike = fetch): TtsProvider {
  return {
    id: "openai",
    async stream(text, opts) {
      const res = await fetchImpl("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: providerSetting("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
          voice: providerSetting("OPENAI_TTS_VOICE", "coral"),
          input: text,
          instructions: opts.lang === "en" ? OPENAI_TTS_INSTRUCTIONS_EN : OPENAI_TTS_INSTRUCTIONS_BN,
          response_format: "mp3",
        }),
        signal: opts.signal,
      });
      await ensureOk("openai", res);
      if (!res.body) throw new ProviderError("openai", "empty body");
      return res.body;
    },
  };
}
