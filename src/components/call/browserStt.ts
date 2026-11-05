/**
 * Browser STT with the Web Speech API (SRS 2 section 8.2, owner decision O-01, FR-B5).
 * - Allowlist: desktop Chrome and Android Chrome only (Safari/Edge/others: server STT).
 * - continuous + interimResults, auto-restart on `end` while running (Chrome stops after ~60 s).
 * - End of turn: final results merged, emitted 700 ms after the last result.
 * - Chrome sometimes never marks a result final (long digit strings, TC-04) or ends the session
 *   with only interim text. Interim text with no new result for STALL_MS, or still pending when
 *   the session ends, is promoted to final, so the caller's words are never lost.
 * - The recognizer is never aborted while the call runs; restarts retry until they work and a
 *   watchdog restarts it if it stopped (TC-07: a failed restart left the mic deaf).
 */

/** Interim text unchanged this long counts as the end of the caller's turn. */
export const STALL_MS = 1500;

/** Minimal Web Speech types (not in every TS DOM lib). */
interface SpeechAlt {
  transcript: string;
  confidence: number;
}
interface SpeechResult {
  isFinal: boolean;
  length: number;
  [i: number]: SpeechAlt;
}
interface SpeechEvent {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** true only for desktop Chrome and Android Chrome (user agent check, not just feature detection). */
export function isBrowserSttAllowed(ua: string): boolean {
  if (!/Chrome\/\d+/.test(ua)) return false;
  if (/Edg\/|EdgA\/|OPR\/|Opera|SamsungBrowser|YaBrowser|UCBrowser|Brave|Vivaldi|DuckDuckGo|; wv\)/.test(ua)) return false;
  if (/iPhone|iPad|iPod|CriOS/.test(ua)) return false;
  return true;
}

export function browserSttAvailable(): boolean {
  if (typeof navigator === "undefined") return false;
  return isBrowserSttAllowed(navigator.userAgent) && recognitionCtor() !== null;
}

export function isAndroid(ua: string): boolean {
  return /Android/i.test(ua);
}

export type BrowserSttError = "not-allowed" | "network" | "audio-capture" | "other";

export interface BrowserSttOptions {
  lang: "bn-BD" | "en-US";
  onInterim: (text: string) => void;
  onFinal: (text: string, confidence?: number) => void;
  onError: (kind: BrowserSttError) => void;
  debounceMs?: number;
  stallMs?: number;
  /** Tests only. */
  ctor?: RecognitionCtor;
}

export class BrowserStt {
  private rec: Recognition | null = null;
  private running = false;
  /** true between the recognizer's `start` and `end` events. */
  private live = false;
  private finalBuf = "";
  private confs: number[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stallTimer: ReturnType<typeof setTimeout> | undefined;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setInterval> | undefined;
  private interimBuf = "";
  /** Result indices below this were promoted already in this session: ignore them (no double send). */
  private skipBelow = 0;
  private resultsLength = 0;
  private restarts = 0;
  private startFailures = 0;

  constructor(private opts: BrowserSttOptions) {}

  start(): boolean {
    const Ctor = this.opts.ctor ?? recognitionCtor();
    if (!Ctor) return false;
    this.running = true;
    if (!this.createAndStart(Ctor)) {
      this.running = false;
      return false;
    }
    // Safety net (TC-07): if the recognizer ever stops without restarting, start it again.
    this.watchdog = setInterval(() => {
      if (this.running && !this.live && this.restartTimer === undefined) this.scheduleRestart(0);
    }, 3000);
    return true;
  }

  private createAndStart(Ctor: RecognitionCtor): boolean {
    const rec = new Ctor();
    rec.lang = this.opts.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      this.live = true;
      this.startFailures = 0;
      this.skipBelow = 0;
      this.resultsLength = 0;
    };
    rec.onresult = (e) => this.handleResult(e);
    rec.onerror = (e) => this.handleError(e.error);
    rec.onend = () => {
      this.live = false;
      if (!this.running || this.rec !== rec) return;
      // Session ended with words still interim: keep them as the caller's turn.
      this.promoteInterim();
      // Chrome ends the session after silence or ~60 s: start again.
      this.scheduleRestart(120);
    };
    this.rec = rec;
    try {
      rec.start();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start the recognizer again. Chrome throws if it is not fully stopped yet, so retry with a
   * short delay, and after 5 failures replace the recognizer object (TC-07: a failed restart
   * left the microphone deaf for the rest of the call).
   */
  private scheduleRestart(delayMs: number): void {
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      if (!this.running || this.live) return;
      try {
        this.rec?.start();
        this.restarts++;
      } catch {
        this.startFailures++;
        if (this.startFailures >= 5) {
          this.startFailures = 0;
          const Ctor = this.opts.ctor ?? recognitionCtor();
          try {
            this.rec?.abort();
          } catch {
            // ignore
          }
          if (Ctor && this.createAndStart(Ctor)) return;
        }
        this.scheduleRestart(300);
      }
    }, delayMs);
  }

  stop(): void {
    this.running = false;
    this.live = false;
    clearTimeout(this.timer);
    clearTimeout(this.stallTimer);
    clearTimeout(this.restartTimer);
    this.restartTimer = undefined;
    clearInterval(this.watchdog);
    this.finalBuf = "";
    this.interimBuf = "";
    const rec = this.rec;
    this.rec = null;
    try {
      rec?.abort();
    } catch {
      // ignore
    }
  }

  private handleResult(e: SpeechEvent): void {
    let interim = "";
    let gotFinal = false;
    this.resultsLength = e.results.length;
    for (let i = Math.max(e.resultIndex, this.skipBelow); i < e.results.length; i++) {
      const r = e.results[i]!;
      const alt = r[0];
      if (!alt) continue;
      if (r.isFinal) {
        this.finalBuf = `${this.finalBuf} ${alt.transcript}`.trim();
        if (alt.confidence > 0) this.confs.push(alt.confidence);
        gotFinal = true;
      } else interim += alt.transcript;
    }
    this.interimBuf = interim.trim();
    clearTimeout(this.stallTimer);
    if (this.interimBuf) {
      this.stallTimer = setTimeout(() => this.promoteInterim(), this.opts.stallMs ?? STALL_MS);
    }
    const shown = `${this.finalBuf} ${interim}`.trim();
    if (shown) this.opts.onInterim(shown);
    if (gotFinal || (this.finalBuf && interim)) this.schedule();
  }

  /**
   * Treat pending interim text as final and flush it. The recognizer keeps running (no abort,
   * TC-07); results up to now are skipped, so a late final for the same words is not sent twice.
   */
  private promoteInterim(): void {
    clearTimeout(this.stallTimer);
    if (!this.interimBuf) return;
    this.finalBuf = `${this.finalBuf} ${this.interimBuf}`.trim();
    this.interimBuf = "";
    this.skipBelow = this.resultsLength;
    this.schedule();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const text = this.finalBuf.trim();
      const conf = this.confs.length ? this.confs.reduce((a, b) => a + b, 0) / this.confs.length : undefined;
      this.finalBuf = "";
      this.confs = [];
      if (text) this.opts.onFinal(text.normalize("NFC"), conf);
    }, this.opts.debounceMs ?? 700);
  }

  private handleError(error: string): void {
    if (error === "no-speech" || error === "aborted") return;
    if (error === "not-allowed" || error === "service-not-allowed") {
      this.running = false;
      this.opts.onError("not-allowed");
    } else if (error === "network") {
      this.running = false;
      this.opts.onError("network");
    } else if (error === "audio-capture") this.opts.onError("audio-capture");
    else this.opts.onError("other");
  }
}
