/**
 * Agent audio playback (SRS 2 section 8.4).
 * - One AudioContext (created and resumed in the Start click).
 * - Per sentence: fetch /api/tts at once (max 2 in flight), decodeAudioData, play with
 *   AudioBufferSourceNode strictly in arrival (= seq) order. No <audio>, no MediaSource.
 * - Output goes through an AnalyserNode: getLevel() 0..1 for the mascot beak / orb.
 * - spokenPrefix: sentences fully played in this agent turn + the current one if > 50% played.
 */

export type ItemKind = "greeting" | "sentence" | "filler";

export interface QueueItem {
  key: number;
  seq: number;
  kind: ItemKind;
  text: string;
  ttsText: string;
  state: "new" | "loading" | "ready" | "failed";
  buffer?: AudioBuffer;
  ctrl?: AbortController;
}

export interface AudioQueueEvents {
  onStart?: (item: QueueItem) => void;
  onEnd?: (item: QueueItem) => void;
  /** Queue empty and nothing playing. */
  onIdle?: () => void;
  onError?: (item: QueueItem, err: unknown) => void;
}

export type FetchAudio = (item: QueueItem, signal: AbortSignal) => Promise<ArrayBuffer>;

const MAX_IN_FLIGHT = 2;

export class AudioQueue {
  readonly analyser: AnalyserNode;
  private items: QueueItem[] = [];
  private nextKey = 1;
  private current: { item: QueueItem; source: AudioBufferSourceNode; startedAt: number; duration: number } | null = null;
  private turnPlayed: QueueItem[] = [];
  private turnQueuedReal = false;
  private lastPlayed: QueueItem | null = null;
  private data: Uint8Array<ArrayBuffer>;

  constructor(
    private ctx: AudioContext,
    private fetchAudio: FetchAudio,
    private events: AudioQueueEvents = {},
  ) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.6;
    this.analyser.connect(ctx.destination);
    this.data = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
  }

  /** Call when a new agent turn starts (before its first sentence). */
  resetTurn(): void {
    this.turnPlayed = [];
    this.turnQueuedReal = false;
  }

  enqueue(seq: number, kind: ItemKind, text: string, ttsText: string): void {
    if (!ttsText.trim()) return;
    if (kind !== "filler") this.turnQueuedReal = true;
    this.items.push({ key: this.nextKey++, seq, kind, text, ttsText, state: "new" });
    this.pump();
    this.playNext();
  }

  /** Something is playing or waiting to play. */
  isActive(): boolean {
    return this.current !== null || this.items.length > 0;
  }

  /**
   * true when the agent is on (or just finished) its last queued sentence and it is a question:
   * the caller may answer before the audio ends (TC-06).
   */
  isAskingLastQuestion(): boolean {
    // The latest sentence heard or being heard (queued, not yet played sentences do not count).
    const item = this.current?.item ?? this.lastPlayed;
    return !!item && /[?？]\s*$/.test(item.text.trim());
  }

  isPlaying(): boolean {
    return this.current !== null;
  }

  /** Texts the mic may hear now (for the echo filter): current, queued next and last played. */
  echoTexts(): string[] {
    const out: string[] = [];
    const add = (i: QueueItem | null | undefined) => {
      if (i) out.push(i.text, i.ttsText);
    };
    add(this.current?.item);
    add(this.items[0]);
    add(this.lastPlayed);
    return out;
  }

  /**
   * Stop at once (barge-in or end): stop the source, abort all TTS fetches, clear the queue.
   * Returns what was said in this agent turn.
   */
  stop(): { interrupted: boolean; seq?: number; spokenPrefix: string } {
    const spoken = this.turnPlayed.filter((i) => i.kind !== "filler").map((i) => i.text);
    let seq: number | undefined;
    const cur = this.current;
    if (cur && cur.item.kind !== "filler") {
      const played = (this.ctx.currentTime - cur.startedAt) / Math.max(0.01, cur.duration);
      if (played > 0.5) spoken.push(cur.item.text);
      seq = cur.item.seq;
    }
    const lastReal = [...this.turnPlayed].reverse().find((i) => i.kind !== "filler");
    seq ??= lastReal?.seq ?? this.items.find((i) => i.kind !== "filler")?.seq;
    const interrupted = this.turnQueuedReal && (cur !== null || this.items.some((i) => i.kind !== "filler"));
    if (cur) {
      cur.source.onended = null;
      try {
        cur.source.stop();
      } catch {
        // already stopped
      }
      this.current = null;
    }
    for (const i of this.items) i.ctrl?.abort();
    this.items = [];
    return { interrupted, seq, spokenPrefix: spoken.join(" ").trim() };
  }

  /** Agent voice level 0..1 (RMS of the output). */
  getLevel(): number {
    if (!this.current) return 0;
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = (this.data[i]! - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.data.length) * 3);
  }

  private pump(): void {
    const loading = this.items.filter((i) => i.state === "loading").length;
    let slots = MAX_IN_FLIGHT - loading;
    for (const item of this.items) {
      if (slots <= 0) break;
      if (item.state !== "new") continue;
      slots--;
      item.state = "loading";
      item.ctrl = new AbortController();
      this.fetchAudio(item, item.ctrl.signal)
        .then((buf) => this.ctx.decodeAudioData(buf))
        .then((audio) => {
          item.buffer = audio;
          item.state = "ready";
        })
        .catch((err) => {
          if (item.ctrl?.signal.aborted) return;
          item.state = "failed";
          this.events.onError?.(item, err);
        })
        .finally(() => {
          if (!this.items.includes(item)) return;
          this.pump();
          this.playNext();
        });
    }
  }

  private playNext(): void {
    if (this.current) return;
    while (this.items[0]?.state === "failed") this.items.shift();
    const item = this.items[0];
    if (!item) {
      this.events.onIdle?.();
      return;
    }
    if (item.state !== "ready" || !item.buffer) return; // wait for its fetch
    this.items.shift();
    const source = this.ctx.createBufferSource();
    source.buffer = item.buffer;
    source.connect(this.analyser);
    this.current = { item, source, startedAt: this.ctx.currentTime, duration: item.buffer.duration };
    source.onended = () => {
      if (this.current?.source !== source) return;
      this.current = null;
      this.turnPlayed.push(item);
      this.lastPlayed = item;
      this.events.onEnd?.(item);
      this.pump();
      this.playNext();
    };
    source.start();
    this.events.onStart?.(item);
    this.pump();
  }
}
