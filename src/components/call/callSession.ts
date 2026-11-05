/**
 * One live call in the browser (SRS 2 section 8). Plain TypeScript (no React) so the logic is
 * easy to follow; `useCall` wires it to the reducer in callState.ts.
 *
 * Mic -> STT (browser Web Speech, or VAD clips -> /api/stt) -> echo filter / barge-in ->
 * POST /turn (SSE) -> sentences -> /api/tts -> AudioQueue -> speaker.
 */
import {
  DEFAULT_CLINIC_SLUG,
  HEADERS,
  LIMITS,
  TtsProviderIdSchema,
  type CallLang,
  type EndReason,
  type InputMode,
  type ServerSttProviderId,
  type StartCallResponse,
  type SttProviderId,
  type SttResponse,
  type TtsProviderId,
  type TurnClientEvent,
  type TurnEvent,
  type TurnRequest,
} from "@/contracts";
import { readSse } from "@/lib/agent/sse";
import { AudioQueue, type QueueItem } from "./audioQueue";
import { BrowserStt, browserSttAvailable, isAndroid } from "./browserStt";
import type { CallAction, CallErrorKind } from "./callState";
import { echoCheck, isShortAnswer } from "./echoFilter";
import { CallRecorder, uploadRecording } from "./recorder";
import { VadStt } from "./vadStt";

export interface SessionOptions {
  clinicSlug?: string;
  lang: CallLang;
  reviewKey?: string;
  /** Called on every reducer action (dev logging hook). */
  debug?: boolean;
}

const SILENCE_MS = LIMITS.SILENCE_MS;
const TIME_WARNING_S = LIMITS.TIME_WARNING_SECONDS;

function micErrorKind(err: unknown): CallErrorKind {
  const name = (err as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "mic_denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "mic_missing";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "mic_busy";
  if (name === "SecurityError") return "mic_insecure";
  return "mic_denied";
}

export class CallSession {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micData: Uint8Array<ArrayBuffer> | null = null;
  private queue: AudioQueue | null = null;
  private browserStt: BrowserStt | null = null;
  private vad: VadStt | null = null;
  private recorder: CallRecorder | null = null;

  private callId: string | null = null;
  private token: string | null = null;
  private stt: SttProviderId = "browser";
  private tts: TtsProviderId = "elevenlabs";
  private maxSeconds: number = LIMITS.DEFAULT_MAX_CALL_SECONDS;
  private startedAt = 0;

  private turnSeq = 0;
  private turnCtrl: AbortController | null = null;
  private turnStreaming = false;
  private pendingInterruption: { seq: number; spokenPrefix: string } | null = null;
  private echoFiltered = 0;
  private pendingEnd: { reason: string; summary: string } | null = null;
  private summary: string | undefined;
  private silenceTimer: ReturnType<typeof setTimeout> | undefined;
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private timeWarned = false;
  private ending = false;
  private lastInterimAt = 0;
  private sttChain: Promise<void> = Promise.resolve();
  /** Typed-only call (FR-B13): no microphone, no STT, no recording. */
  private textOnly = false;

  constructor(
    private dispatch: (a: CallAction) => void,
    private opts: SessionOptions,
  ) {}

  get id(): string | null {
    return this.callId;
  }

  isFinished(): boolean {
    return this.ending;
  }

  // -------------------------------------------------------------------------
  // Levels for the mascot / orb
  // -------------------------------------------------------------------------

  getAgentLevel = (): number => this.queue?.getLevel() ?? 0;

  getCallerLevel = (): number => {
    if (this.micAnalyser && this.micData) {
      this.micAnalyser.getByteTimeDomainData(this.micData);
      let sum = 0;
      for (let i = 0; i < this.micData.length; i++) {
        const v = (this.micData[i]! - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / this.micData.length) * 4);
    }
    // No mic analyser (Android + Web Speech): pulse while words arrive.
    return Date.now() - this.lastInterimAt < 300 ? 0.4 : 0;
  };

  // -------------------------------------------------------------------------
  // Start
  // -------------------------------------------------------------------------

  /** Call directly from the Start button click (creates and resumes the AudioContext). */
  async start(stt: SttProviderId, tts: TtsProviderId, opts: { textOnly?: boolean } = {}): Promise<void> {
    this.textOnly = Boolean(opts.textOnly);
    this.dispatch({ type: "START" });
    const Ctx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    void this.ctx.resume();

    if (!this.textOnly) {
      if (!navigator.mediaDevices?.getUserMedia) {
        this.dispatch({ type: "MIC_ERROR", kind: window.isSecureContext ? "mic_missing" : "mic_insecure" });
        this.cleanupMedia();
        return;
      }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (err) {
        this.dispatch({ type: "MIC_ERROR", kind: micErrorKind(err) });
        this.cleanupMedia();
        return;
      }
    }
    this.dispatch({ type: "MIC_OK" });

    let wantStt = stt;
    if (!this.textOnly && stt === "browser" && !browserSttAvailable()) {
      wantStt = "elevenlabs";
      this.dispatch({ type: "NOTICE", notice: "browser_stt_unsupported" });
    }

    let data: StartCallResponse;
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicSlug: this.opts.clinicSlug ?? DEFAULT_CLINIC_SLUG,
          sttProvider: wantStt,
          ttsProvider: tts,
          lang: this.opts.lang,
          userAgent: navigator.userAgent.slice(0, 500),
          ...(this.opts.reviewKey ? { reviewKey: this.opts.reviewKey } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        this.dispatch({
          type: "CONNECT_FAILED",
          kind: res.status === 429 ? "rate_limited" : res.status >= 500 ? "providers" : "network",
          message: body?.error?.message,
        });
        this.cleanupMedia();
        return;
      }
      data = (await res.json()) as StartCallResponse;
    } catch {
      this.dispatch({ type: "CONNECT_FAILED", kind: "network" });
      this.cleanupMedia();
      return;
    }

    this.callId = data.callId;
    this.token = data.callToken;
    this.stt = data.providers.stt;
    this.tts = data.providers.tts;
    this.maxSeconds = data.maxSeconds;
    this.startedAt = Date.now();

    const ctx = this.ctx;
    // Android Chrome: Web Speech and a second mic capture fight; release ours, skip recording.
    if (this.textOnly) {
      // no microphone in typed mode
    } else if (this.stt === "browser" && isAndroid(navigator.userAgent)) {
      this.stopStream();
      this.dispatch({ type: "NOTICE", notice: "recording_skipped" });
    } else if (this.stream) {
      const src = ctx.createMediaStreamSource(this.stream);
      this.micAnalyser = ctx.createAnalyser();
      this.micAnalyser.fftSize = 512;
      this.micData = new Uint8Array(new ArrayBuffer(this.micAnalyser.fftSize));
      src.connect(this.micAnalyser);
      this.recorder = CallRecorder.create(this.stream);
      if (this.recorder) this.recorder.start();
      else this.dispatch({ type: "NOTICE", notice: "recording_skipped" });
    }

    this.queue = new AudioQueue(ctx, (item, signal) => this.fetchAudio(item, signal), {
      onStart: () => {
        this.clearSilence();
        this.dispatch({ type: "SPEAKING" });
      },
      onIdle: () => this.onQueueIdle(),
      onError: () => this.dispatch({ type: "NOTICE", notice: "tts_failed" }),
    });

    this.dispatch({
      type: "CONNECTED",
      callId: data.callId,
      maxSeconds: data.maxSeconds,
      stt: this.stt,
      tts: this.tts,
      nowMs: this.startedAt,
      greeting: data.greeting.text,
    });

    await this.startStt();
    this.queue.resetTurn();
    this.queue.enqueue(-1, "greeting", data.greeting.text, data.greeting.ttsText);
    this.tickTimer = setInterval(() => this.tick(), 500);
    window.addEventListener("pagehide", this.onPageHide);
  }

  // -------------------------------------------------------------------------
  // STT
  // -------------------------------------------------------------------------

  private async startStt(): Promise<void> {
    if (this.textOnly) return;
    if (this.stt === "browser") {
      this.browserStt = new BrowserStt({
        lang: this.opts.lang === "en" ? "en-US" : "bn-BD",
        onInterim: (t) => this.onCallerText(t, false),
        onFinal: (t, c) => this.onCallerText(t, true, c),
        onError: (kind) => {
          if (kind === "not-allowed") {
            this.dispatch({ type: "FAILED", kind: "mic_denied" });
            void this.end("error");
          } else if (kind === "network") {
            void this.switchToServerStt();
          }
        },
      });
      if (!this.browserStt.start()) await this.switchToServerStt();
      return;
    }
    await this.startVad();
  }

  private async switchToServerStt(): Promise<void> {
    this.browserStt?.stop();
    this.browserStt = null;
    this.stt = "elevenlabs";
    this.dispatch({ type: "SWITCH_STT", stt: "elevenlabs" });
    this.dispatch({ type: "NOTICE", notice: "stt_network_switch" });
    await this.startVad();
  }

  private async startVad(): Promise<void> {
    if (!this.ctx || this.ending) return;
    if (!this.stream) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        this.dispatch({ type: "FAILED", kind: "mic_busy" });
        void this.end("error");
        return;
      }
    }
    this.vad = new VadStt(this.ctx, this.stream, {
      onSpeechStart: () => {
        this.lastInterimAt = Date.now();
        this.clearSilence();
      },
      onClip: (wav) => {
        this.sttChain = this.sttChain.then(() => this.transcribeClip(wav));
      },
    });
    this.vad.start();
  }

  private async transcribeClip(wav: ArrayBuffer): Promise<void> {
    if (!this.callId || !this.token || this.ending || wav.byteLength > LIMITS.STT_CLIP_MAX_BYTES) return;
    this.dispatch({ type: "PROCESSING", on: true });
    try {
      const fd = new FormData();
      fd.append("audio", new Blob([wav], { type: "audio/wav" }), "clip.wav");
      fd.append("provider", (this.stt === "browser" ? "elevenlabs" : this.stt) as ServerSttProviderId);
      fd.append("callId", this.callId);
      fd.append("lang", this.opts.lang);
      const res = await fetch("/api/stt", { method: "POST", headers: { Authorization: `Bearer ${this.token}` }, body: fd });
      if (!res.ok) {
        this.dispatch({ type: "NOTICE", notice: "turn_failed" });
        return;
      }
      const r = (await res.json()) as SttResponse;
      if (r.fallbackFrom) this.dispatch({ type: "NOTICE", notice: "stt_fallback" });
      if (r.text.trim()) this.onCallerText(r.text, true, r.confidence);
    } catch {
      this.dispatch({ type: "NOTICE", notice: "turn_failed" });
    } finally {
      this.dispatch({ type: "PROCESSING", on: false });
    }
  }

  // -------------------------------------------------------------------------
  // Caller text, echo filter and barge-in
  // -------------------------------------------------------------------------

  private onCallerText(text: string, final: boolean, confidence?: number): void {
    if (this.ending || !this.queue) return;
    this.lastInterimAt = Date.now();
    this.clearSilence();
    const agentBusy = this.queue.isActive();
    if (!final) {
      // Safety net: if the final never comes, the silence prompt still fires (TC-04).
      if (!agentBusy) this.startSilence();
      if (!agentBusy) this.dispatch({ type: "INTERIM", text });
      else if (echoCheck(text, this.queue.echoTexts()).accept) {
        this.bargeIn();
        this.dispatch({ type: "INTERIM", text });
      }
      return;
    }
    if (agentBusy) {
      // A yes/no answer while the agent finishes its question is the caller, not echo (TC-06).
      const answer = this.queue.isAskingLastQuestion() && isShortAnswer(text);
      const d = answer ? ({ accept: true, overlap: 0 } as const) : echoCheck(text, this.queue.echoTexts());
      if (!d.accept) {
        if (d.reason === "echo") this.echoFiltered++;
        this.dispatch({ type: "INTERIM", text: "" });
        return;
      }
      this.bargeIn();
    }
    void this.sendTurn({ text, inputMode: "voice", confidence });
  }

  /** Typed input (FR-B13): always accepted, interrupts the agent. */
  sendTyped(text: string): void {
    const t = text.trim().slice(0, LIMITS.TEXT_MAX_CHARS);
    if (!t || this.ending || !this.queue) return;
    this.clearSilence();
    this.bargeIn();
    void this.sendTurn({ text: t, inputMode: "typed" });
  }

  /** Stop the agent at once (FR-C17: within 300 ms of accepting caller text). */
  private bargeIn(): void {
    if (!this.queue?.isActive()) return;
    const r = this.queue.stop();
    if (r.interrupted) this.pendingInterruption = { seq: Math.max(0, r.seq ?? 0), spokenPrefix: r.spokenPrefix };
    this.turnCtrl?.abort();
    this.turnStreaming = false;
    this.pendingEnd = null;
    this.dispatch({ type: "LISTENING" });
    this.startSilence();
  }

  // -------------------------------------------------------------------------
  // Turns (SSE)
  // -------------------------------------------------------------------------

  private async sendTurn(input: { text?: string; inputMode?: InputMode; confidence?: number; event?: TurnClientEvent }): Promise<void> {
    if (!this.callId || !this.token || this.ending || !this.queue) return;
    this.turnCtrl?.abort();
    const ctrl = new AbortController();
    this.turnCtrl = ctrl;
    this.clearSilence();
    this.queue.resetTurn();
    const body: TurnRequest = {
      turnSeq: ++this.turnSeq,
      text: input.text ?? "",
      inputMode: input.inputMode ?? "voice",
      sttProvider: this.stt,
      clientTs: Date.now(),
      ...(input.confidence !== undefined ? { sttConfidence: Math.max(0, Math.min(1, input.confidence)) } : {}),
      ...(input.event ? { event: input.event } : {}),
      ...(this.pendingInterruption
        ? {
            interruptedAgentSeq: this.pendingInterruption.seq,
            spokenPrefix: this.pendingInterruption.spokenPrefix.slice(0, LIMITS.TEXT_MAX_CHARS),
          }
        : {}),
      ...(this.echoFiltered ? { echoFilteredCount: this.echoFiltered } : {}),
    };
    this.pendingInterruption = null;
    this.echoFiltered = 0;
    this.turnStreaming = true;
    if (input.text) this.dispatch({ type: "CALLER_FINAL", text: input.text, inputMode: body.inputMode });
    else this.dispatch({ type: "THINKING" });

    try {
      const res = await fetch(`/api/calls/${this.callId}/turn`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
        if (err?.error?.code === "stale_turn") return;
        if (err?.error?.code === "call_ended") {
          void this.end("agent_end");
          return;
        }
        this.dispatch({ type: "NOTICE", notice: "turn_failed" });
        return;
      }
      await readSse(res.body, (e) => {
        if (!ctrl.signal.aborted) this.onTurnEvent(e);
      });
    } catch {
      if (!ctrl.signal.aborted) this.dispatch({ type: "NOTICE", notice: "turn_failed" });
    } finally {
      if (this.turnCtrl === ctrl) {
        this.turnStreaming = false;
        if (!this.queue?.isActive()) this.onQueueIdle();
      }
    }
  }

  private onTurnEvent(e: TurnEvent): void {
    const q = this.queue;
    if (!q) return;
    switch (e.type) {
      case "sentence":
        q.enqueue(e.seq, "sentence", e.text, e.ttsText);
        this.dispatch({ type: "AGENT_SENTENCE", text: e.text });
        break;
      case "filler":
        q.enqueue(-1, "filler", "", e.ttsText);
        break;
      case "tool":
        if (e.status === "start") this.dispatch({ type: "NOTICE", notice: "checking" });
        break;
      case "end_call":
        this.pendingEnd = { reason: e.reason, summary: e.summary };
        this.summary = e.summary;
        break;
      case "error":
        this.dispatch({ type: "NOTICE", notice: "turn_failed" });
        break;
      case "done":
        break;
    }
  }

  private async fetchAudio(item: QueueItem, signal: AbortSignal): Promise<ArrayBuffer> {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ callId: this.callId, text: item.ttsText.slice(0, LIMITS.TEXT_MAX_CHARS), provider: this.tts, seq: item.seq }),
      signal,
    });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const used = TtsProviderIdSchema.safeParse(res.headers.get(HEADERS.PROVIDER));
    if (used.success && used.data !== this.tts) {
      // Stick to the voice that worked for the rest of the call: no repeated failed tries
      // (TC-02, extra delay per sentence) and no voice change in the middle of the call.
      this.tts = used.data;
      this.dispatch({ type: "NOTICE", notice: "tts_fallback" });
    }
    return res.arrayBuffer();
  }

  private onQueueIdle(): void {
    if (this.ending) return;
    if (this.pendingEnd && !this.turnStreaming) {
      void this.end("agent_end");
      return;
    }
    if (this.turnStreaming) {
      this.dispatch({ type: "THINKING" });
      return;
    }
    this.dispatch({ type: "LISTENING" });
    this.startSilence();
  }

  // -------------------------------------------------------------------------
  // Timers: silence (FR-C16) and time limit (FR-B9, FR-C20)
  // -------------------------------------------------------------------------

  private clearSilence(): void {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = undefined;
  }

  private startSilence(): void {
    this.clearSilence();
    this.silenceTimer = setTimeout(() => {
      if (this.ending) return;
      // Agent still talking or a turn still streaming: check again later instead of giving up.
      if (this.turnStreaming || this.queue?.isActive()) {
        this.startSilence();
        return;
      }
      void this.sendTurn({ event: "silence" });
    }, this.textOnly ? SILENCE_MS * 3 : SILENCE_MS);
  }

  private tick(): void {
    if (this.ending) return;
    const now = Date.now();
    this.dispatch({ type: "TICK", nowMs: now });
    const elapsed = (now - this.startedAt) / 1000;
    if (elapsed >= this.maxSeconds) {
      void this.end("time_limit");
      return;
    }
    if (!this.timeWarned && elapsed >= Math.min(TIME_WARNING_S, this.maxSeconds - 30) && !this.turnStreaming && !this.queue?.isActive()) {
      this.timeWarned = true;
      void this.sendTurn({ event: "time_warning" });
    }
  }

  // -------------------------------------------------------------------------
  // End
  // -------------------------------------------------------------------------

  private onPageHide = (): void => {
    if (this.ending || !this.callId || !this.token) return;
    this.ending = true;
    const blob = new Blob([JSON.stringify({ reason: "tab_closed", token: this.token })], { type: "application/json" });
    navigator.sendBeacon?.(`/api/calls/${this.callId}/end`, blob);
  };

  async end(reason: EndReason = "caller_hangup"): Promise<void> {
    if (this.ending) return;
    this.ending = true;
    this.dispatch({ type: "ENDING", reason });
    clearInterval(this.tickTimer);
    this.clearSilence();
    window.removeEventListener("pagehide", this.onPageHide);
    this.browserStt?.stop();
    this.vad?.stop();
    if (reason !== "agent_end") this.queue?.stop();
    this.turnCtrl?.abort();

    let recordingPath: string | null = null;
    if (this.recorder && this.callId && this.token) {
      const blob = await this.recorder.stop();
      if (blob && blob.size > 0) recordingPath = await uploadRecording(this.callId, this.token, blob);
    }
    if (this.callId && this.token) {
      try {
        await fetch(`/api/calls/${this.callId}/end`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ reason, ...(recordingPath ? { recordingPath } : {}) }),
          keepalive: true,
        });
      } catch {
        // the server finalises stale calls after 3 minutes
      }
    }
    this.cleanupMedia();
    this.dispatch({ type: "ENDED", summary: this.summary });
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private cleanupMedia(): void {
    this.ending = true;
    this.stopStream();
    this.micAnalyser = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.queue = null;
  }
}
