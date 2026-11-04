/**
 * ElevenLabs TTS (owner decision O-04): model `ELEVENLABS_TTS_MODEL` (default eleven_v4),
 * voice `ELEVENLABS_VOICE_ID` (default 8U6QQz51HQvOsmbnTJ3D), mp3_44100_128, streaming endpoint.
 * POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream?output_format=...
 * `language_code` is sent only when ELEVENLABS_TTS_LANGUAGE_CODE is set (verify v4 support).
 */
import type { TtsProvider } from "../types";
import { ensureOk, providerSetting, ProviderError, type FetchLike } from "../common";

export interface ElevenLabsTtsConfig {
  apiKey: string;
  voiceId?: string;
  modelId?: string;
  fetchImpl?: FetchLike;
}

export function createElevenLabsTts(cfg: ElevenLabsTtsConfig): TtsProvider {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  return {
    id: "elevenlabs",
    async stream(text, opts) {
      const voice = cfg.voiceId ?? providerSetting("ELEVENLABS_VOICE_ID", "8U6QQz51HQvOsmbnTJ3D");
      const model = cfg.modelId ?? providerSetting("ELEVENLABS_TTS_MODEL", "eleven_v4");
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_128`;
      const languageCode = process.env.ELEVENLABS_TTS_LANGUAGE_CODE?.trim();
      const body: Record<string, unknown> = {
        text,
        model_id: model,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
      };
      if (languageCode) body.language_code = opts.lang === "en" ? "en" : languageCode;
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "xi-api-key": cfg.apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
      await ensureOk("elevenlabs", res);
      if (!res.body) throw new ProviderError("elevenlabs", "empty body");
      return res.body;
    },
  };
}
