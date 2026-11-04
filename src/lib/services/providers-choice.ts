/** Which STT/TTS providers a new call starts with, and whose key pays (FR-B2, O-05, O-06). Pure. */
import {
  SERVER_STT_FALLBACK_ORDER,
  TTS_FALLBACK_ORDER,
  type KeyProvider,
  type KeySource,
  type SttProviderId,
  type TtsProviderId,
} from "@/contracts";

export interface KeyAvailability {
  /** Providers with a platform key in env. */
  platform: ReadonlySet<KeyProvider>;
  /** Providers with a clinic BYOK key. */
  byok: ReadonlySet<KeyProvider>;
}

export interface ChosenProviders {
  stt: SttProviderId;
  tts: TtsProviderId;
  keySource: KeySource;
}

const has = (k: KeyAvailability, p: KeyProvider): boolean => k.platform.has(p) || k.byok.has(p);

/** Platform keys present in an env object (names from .env.example). */
export function platformKeys(env: {
  ELEVENLABS_API_KEY?: string;
  OPENAI_API_KEY?: string;
  AZURE_SPEECH_KEY?: string;
}): Set<KeyProvider> {
  const s = new Set<KeyProvider>();
  if (env.ELEVENLABS_API_KEY) s.add("elevenlabs");
  if (env.OPENAI_API_KEY) s.add("openai");
  if (env.AZURE_SPEECH_KEY) s.add("azure");
  return s;
}

/** Keep the requested provider when it has a key; otherwise the first one in fallback order. */
export function chooseProviders(
  req: { stt: SttProviderId; tts: TtsProviderId },
  keys: KeyAvailability,
): ChosenProviders {
  let stt: SttProviderId = req.stt;
  if (stt !== "browser" && !has(keys, stt)) {
    stt = SERVER_STT_FALLBACK_ORDER.find((p) => has(keys, p)) ?? "browser";
  }
  let tts: TtsProviderId = req.tts;
  if (!has(keys, tts)) tts = TTS_FALLBACK_ORDER.find((p) => has(keys, p)) ?? req.tts;
  const byok = (stt !== "browser" && keys.byok.has(stt)) || keys.byok.has(tts);
  return { stt, tts, keySource: byok ? "byok" : "platform" };
}
