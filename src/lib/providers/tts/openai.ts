/**
 * OpenAI TTS: POST https://api.openai.com/v1/audio/speech, model `gpt-4o-mini-tts`
 * (OPENAI_TTS_MODEL), female voice (OPENAI_TTS_VOICE, default "nova": brighter than "coral", which sounded too heavy in TC-02; instructions ask for an energetic young voice, owner found the calm version dull), mp3, with `instructions`.
 */
import type { TtsProvider } from "../types";
import { ensureOk, providerSetting, ProviderError, type FetchLike } from "../common";

export const OPENAI_TTS_INSTRUCTIONS_BN =
  "Voice: a young woman of about 22, an energetic, cheerful receptionist at a busy dental clinic in Dhaka. High, bright, youthful feminine voice, full of energy and warmth, smiling while she talks; lively and upbeat, never flat, never tired, never deep or mature. Natural Bangladeshi Bangla accent from Dhaka (not Kolkata). Brisk, natural pace with clear words, rising friendly intonation on questions.";
export const OPENAI_TTS_INSTRUCTIONS_EN =
  "Voice: a young woman of about 22, an energetic, cheerful receptionist at a dental clinic in Dhaka. High, bright, youthful voice full of energy, smiling while she talks; lively and upbeat, never flat or deep. Clear simple English with a light Bangladeshi accent, brisk natural pace.";

export function createOpenAiTts(apiKey: string, fetchImpl: FetchLike = fetch): TtsProvider {
  return {
    id: "openai",
    async stream(text, opts) {
      const res = await fetchImpl("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: providerSetting("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
          voice: providerSetting("OPENAI_TTS_VOICE", "nova"),
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
