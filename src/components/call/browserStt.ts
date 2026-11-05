/**
 * Browser STT with the Web Speech API (SRS 2 section 8.2, owner decision O-01, FR-B5).
 * - Allowlist: desktop Chrome and Android Chrome only (Safari/Edge/others: server STT).
 * - continuous + interimResults, auto-restart on `end` while running (Chrome stops after ~60 s).
 * - End of turn: final results merged, emitted 700 ms after the last result.
 * - Chrome sometimes never marks a result final (long digit strings, TC-04) or ends the session
 *   with only interim text. Interim text with no new result for STALL_MS, or still pending when
 *   the session ends, is promoted to final, so the caller's words are never lost.
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
  private finalBuf = "";
  private confs: number[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stallTimer: ReturnType<typeof setTimeout> | undefined;
  private interimBuf = "";
  private restarts = 0;

  constructor(private opts: BrowserSttOptions) {}

  start(): boolean {
    const Ctor = this.opts.ctor ?? recognitionCtor();
    if (!Ctor) return false;
    this.running = true;
    const rec = new Ctor();
    rec.lang = this.opts.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => this.handleResult(e);
    rec.onerror = (e) => this.handleError(e.error);
    rec.onend = () => {
      if (!this.running) return;
      // Session ended with words still interim: keep them as the caller's turn.
      this.promoteInterim(false);
      // Chrome ends the session after silence or ~60 s: start again.
      setTimeout(() => {
        if (!this.running) return;
        try {
          rec.start();
          this.restarts++;
        } catch {
          // already started
        }
      }, 120);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      return false;
    }
    return true;
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
    clearTimeout(this.stallTimer);
    this.finalBuf = "";
    this.interimBuf = "";
    try {
      this.rec?.abort();
    } catch {
      // ignore
    }
    this.rec = null;
  }

  private handleResult(e: SpeechEvent): void {
    let interim = "";
    let gotFinal = false;
    for (let i = e.resultIndex; i < e.results.length; i++) {
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
      this.stallTimer = setTimeout(() => this.promoteInterim(true), this.opts.stallMs ?? STALL_MS);
    }
    const shown = `${this.finalBuf} ${interim}`.trim();
    if (shown) this.opts.onInterim(shown);
    if (gotFinal || (this.finalBuf && interim)) this.schedule();
  }

  /**
   * Treat pending interim text as final and flush it. With `reset`, the live session is aborted
   * (it restarts on `end`) so Chrome cannot send the same words again as a late final result.
   */
  private promoteInterim(reset: boolean): void {
    clearTimeout(this.stallTimer);
    if (!this.interimBuf) return;
    this.finalBuf = `${this.finalBuf} ${this.interimBuf}`.trim();
    this.interimBuf = "";
    if (reset) {
      try {
        this.rec?.abort();
      } catch {
        // ignore
      }
    }
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
