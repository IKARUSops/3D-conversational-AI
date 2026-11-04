/**
 * Server STT mode (SRS 2 section 8.3): cut caller speech into clips with a voice activity
 * detector, encode WAV 16 kHz mono, POST to /api/stt.
 *
 * Decision (docs/DECISIONS.md B-03): a small energy-based VAD instead of @ricky0123/vad-web
 * (Silero ONNX). No new dependency, no ONNX/wasm assets to host, and it runs in every browser.
 * Trade-off: noisier rooms may cut clips early or late; the 700 ms hang time hides most of it.
 */

export const TARGET_RATE = 16_000;

/** Linear-interpolation resample to 16 kHz. */
export function downsample(input: Float32Array, fromRate: number, toRate = TARGET_RATE): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = pos - i0;
    out[i] = input[i0]! * (1 - t) + input[i1]! * t;
  }
  return out;
}

/** 16-bit PCM WAV file from float samples (-1..1). */
export function encodeWav(samples: Float32Array, sampleRate = TARGET_RATE): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

export function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!;
  return Math.sqrt(sum / Math.max(1, frame.length));
}

export interface VadOptions {
  onSpeechStart?: () => void;
  /** WAV 16 kHz mono clip of one utterance. */
  onClip: (wav: ArrayBuffer, durationMs: number) => void;
  minSpeechMs?: number;
  hangMs?: number;
  maxClipMs?: number;
}

/** Pure VAD state machine over frames (testable without audio APIs). */
export class EnergyVad {
  private noise = 0.01;
  private speaking = false;
  private speechMs = 0;
  private silenceMs = 0;
  private frames: Float32Array[] = [];
  private preRoll: Float32Array[] = [];

  constructor(
    private sampleRate: number,
    private opts: VadOptions,
  ) {}

  push(frame: Float32Array): void {
    const frameMs = (frame.length / this.sampleRate) * 1000;
    const level = rms(frame);
    const threshold = Math.max(0.012, this.noise * 3);
    const voiced = level > threshold;
    if (!this.speaking) {
      // Track the noise floor slowly while nobody speaks.
      this.noise = this.noise * 0.95 + level * 0.05;
      this.preRoll.push(frame);
      if (this.preRoll.length * frameMs > 300) this.preRoll.shift();
      if (voiced) {
        this.speaking = true;
        this.speechMs = frameMs;
        this.silenceMs = 0;
        this.frames = [...this.preRoll];
        this.preRoll = [];
        this.opts.onSpeechStart?.();
      }
      return;
    }
    this.frames.push(frame);
    if (voiced) {
      this.speechMs += frameMs;
      this.silenceMs = 0;
    } else this.silenceMs += frameMs;
    const totalMs = this.frames.length * frameMs;
    if (this.silenceMs >= (this.opts.hangMs ?? 700) || totalMs >= (this.opts.maxClipMs ?? 15_000)) this.cut();
  }

  private cut(): void {
    const frames = this.frames;
    const speechMs = this.speechMs;
    this.speaking = false;
    this.frames = [];
    this.speechMs = 0;
    this.silenceMs = 0;
    if (speechMs < (this.opts.minSpeechMs ?? 300)) return; // noise
    const len = frames.reduce((n, f) => n + f.length, 0);
    const all = new Float32Array(len);
    let o = 0;
    for (const f of frames) {
      all.set(f, o);
      o += f.length;
    }
    const pcm = downsample(all, this.sampleRate);
    this.opts.onClip(encodeWav(pcm), (pcm.length / TARGET_RATE) * 1000);
  }
}

/** Connects EnergyVad to a mic stream inside an existing AudioContext. */
export class VadStt {
  private source: MediaStreamAudioSourceNode | null = null;
  private node: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private vad: EnergyVad;
  private paused = false;

  constructor(
    private ctx: AudioContext,
    private stream: MediaStream,
    opts: VadOptions,
  ) {
    this.vad = new EnergyVad(ctx.sampleRate, opts);
  }

  start(): void {
    this.source = this.ctx.createMediaStreamSource(this.stream);
    // ScriptProcessorNode is deprecated but works in every browser without extra files.
    this.node = this.ctx.createScriptProcessor(2048, 1, 1);
    this.node.onaudioprocess = (e) => {
      if (this.paused) return;
      this.vad.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0; // keep the graph running without playing the mic
    this.source.connect(this.node);
    this.node.connect(this.sink);
    this.sink.connect(this.ctx.destination);
  }

  setPaused(p: boolean): void {
    this.paused = p;
  }

  stop(): void {
    try {
      this.source?.disconnect();
      this.node?.disconnect();
      this.sink?.disconnect();
    } catch {
      // ignore
    }
    if (this.node) this.node.onaudioprocess = null;
    this.source = this.node = this.sink = null;
  }
}
