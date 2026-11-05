/**
 * Call UI state machine (SRS 2 section 8.1, FR-B3). Pure reducer, unit tested.
 *
 * idle -> requesting_mic -> connecting -> listening/thinking/speaking -> ending -> ended
 * requesting_mic -> error (mic); connecting -> error (network / limit)
 */
import type {
  CallLang,
  CallUiState,
  EndReason,
  InputMode,
  MascotState,
  SttProviderId,
  TtsProviderId,
} from "@/contracts";

export type CallErrorKind =
  | "mic_denied"
  | "mic_missing"
  | "mic_busy"
  | "mic_insecure"
  | "network"
  | "rate_limited"
  | "providers"
  | "unknown";

export type CallNotice =
  | "tts_fallback"
  | "stt_fallback"
  | "stt_network_switch"
  | "browser_stt_unsupported"
  | "tts_failed"
  | "recording_skipped"
  | "checking"
  | "turn_failed";

export interface Caption {
  id: number;
  speaker: "agent" | "caller";
  text: string;
  inputMode?: InputMode;
}

export interface CallState {
  phase: CallUiState;
  lang: CallLang;
  sttProvider: SttProviderId;
  ttsProvider: TtsProviderId;
  callId?: string;
  maxSeconds: number;
  startedAtMs?: number;
  elapsedS: number;
  captions: Caption[];
  /** Caller words still being recognised. */
  interim: string;
  /** Server STT request in flight ("processing your words"). */
  processing: boolean;
  notice?: CallNotice;
  error?: { kind: CallErrorKind; message?: string };
  endReason?: EndReason;
  summary?: string;
  nextCaptionId: number;
}

export type CallAction =
  | { type: "SET_PROVIDERS"; stt?: SttProviderId; tts?: TtsProviderId }
  | { type: "SET_LANG"; lang: CallLang }
  | { type: "START" }
  | { type: "MIC_OK" }
  | { type: "MIC_ERROR"; kind: CallErrorKind }
  | { type: "CONNECTED"; callId: string; maxSeconds: number; stt: SttProviderId; tts: TtsProviderId; nowMs: number; greeting: string }
  | { type: "CONNECT_FAILED"; kind: CallErrorKind; message?: string }
  | { type: "LISTENING" }
  | { type: "THINKING" }
  | { type: "SPEAKING" }
  | { type: "INTERIM"; text: string }
  | { type: "CALLER_FINAL"; text: string; inputMode: InputMode }
  | { type: "AGENT_SENTENCE"; text: string }
  | { type: "PROCESSING"; on: boolean }
  | { type: "TICK"; nowMs: number }
  | { type: "NOTICE"; notice?: CallNotice }
  | { type: "SWITCH_STT"; stt: SttProviderId }
  | { type: "ENDING"; reason: EndReason }
  | { type: "ENDED"; summary?: string }
  | { type: "FAILED"; kind: CallErrorKind; message?: string }
  | { type: "RESET" };

export const LIVE_PHASES: readonly CallUiState[] = ["listening", "thinking", "speaking"];
export const isLive = (p: CallUiState) => LIVE_PHASES.includes(p);
const MAX_CAPTIONS = 60;

export function initialCallState(
  init: Partial<Pick<CallState, "lang" | "sttProvider" | "ttsProvider">> = {},
): CallState {
  return {
    phase: "idle",
    lang: init.lang ?? "bn",
    sttProvider: init.sttProvider ?? "elevenlabs",
    ttsProvider: init.ttsProvider ?? "elevenlabs",
    maxSeconds: 300,
    elapsedS: 0,
    captions: [],
    interim: "",
    processing: false,
    nextCaptionId: 1,
  };
}

function addCaption(s: CallState, c: Omit<Caption, "id">): CallState {
  const captions = [...s.captions, { ...c, id: s.nextCaptionId }].slice(-MAX_CAPTIONS);
  return { ...s, captions, nextCaptionId: s.nextCaptionId + 1 };
}

export function callReducer(s: CallState, a: CallAction): CallState {
  switch (a.type) {
    case "SET_PROVIDERS":
      if (s.phase !== "idle" && s.phase !== "ended" && s.phase !== "error") return s;
      return { ...s, sttProvider: a.stt ?? s.sttProvider, ttsProvider: a.tts ?? s.ttsProvider };
    case "SET_LANG":
      return { ...s, lang: a.lang };
    case "START":
      if (s.phase !== "idle" && s.phase !== "ended" && s.phase !== "error") return s;
      return {
        ...initialCallState({ lang: s.lang, sttProvider: s.sttProvider, ttsProvider: s.ttsProvider }),
        phase: "requesting_mic",
        notice: s.notice === "browser_stt_unsupported" ? s.notice : undefined,
      };
    case "MIC_OK":
      return s.phase === "requesting_mic" ? { ...s, phase: "connecting" } : s;
    case "MIC_ERROR":
      return s.phase === "requesting_mic" ? { ...s, phase: "error", error: { kind: a.kind } } : s;
    case "CONNECTED":
      if (s.phase !== "connecting") return s;
      return addCaption(
        {
          ...s,
          phase: "speaking",
          callId: a.callId,
          maxSeconds: a.maxSeconds,
          sttProvider: a.stt,
          ttsProvider: a.tts,
          startedAtMs: a.nowMs,
          elapsedS: 0,
        },
        { speaker: "agent", text: a.greeting },
      );
    case "CONNECT_FAILED":
      return s.phase === "connecting" ? { ...s, phase: "error", error: { kind: a.kind, message: a.message } } : s;
    case "LISTENING":
      return isLive(s.phase) ? { ...s, phase: "listening", notice: s.notice === "checking" ? undefined : s.notice } : s;
    case "THINKING":
      return isLive(s.phase) ? { ...s, phase: "thinking" } : s;
    case "SPEAKING":
      return isLive(s.phase) ? { ...s, phase: "speaking", notice: s.notice === "checking" ? undefined : s.notice } : s;
    case "INTERIM":
      return isLive(s.phase) ? { ...s, interim: a.text } : s;
    case "CALLER_FINAL":
      if (!isLive(s.phase)) return s;
      return addCaption({ ...s, interim: "", phase: "thinking" }, { speaker: "caller", text: a.text, inputMode: a.inputMode });
    case "AGENT_SENTENCE":
      return isLive(s.phase) || s.phase === "ending" ? addCaption(s, { speaker: "agent", text: a.text }) : s;
    case "PROCESSING":
      return { ...s, processing: a.on };
    case "TICK":
      if (!isLive(s.phase) || s.startedAtMs === undefined) return s;
      return { ...s, elapsedS: Math.max(0, Math.floor((a.nowMs - s.startedAtMs) / 1000)) };
    case "NOTICE":
      return { ...s, notice: a.notice };
    case "SWITCH_STT":
      return { ...s, sttProvider: a.stt };
    case "ENDING":
      if (!isLive(s.phase) && s.phase !== "connecting") return s;
      return { ...s, phase: "ending", endReason: a.reason, interim: "", processing: false };
    case "ENDED":
      return s.phase === "ending" ? { ...s, phase: "ended", summary: a.summary ?? s.summary } : s;
    case "FAILED":
      return { ...s, phase: "error", error: { kind: a.kind, message: a.message }, processing: false };
    case "RESET":
      return initialCallState({ lang: s.lang, sttProvider: s.sttProvider, ttsProvider: s.ttsProvider });
  }
}

/** Mascot animation state for the 3D hero (SRS 3 section 4). */
export function mascotStateFor(phase: CallUiState): MascotState {
  switch (phase) {
    case "listening":
      return "listening";
    case "thinking":
    case "connecting":
      return "thinking";
    case "speaking":
      return "speaking";
    default:
      return "idle";
  }
}

/** "1:05" */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
