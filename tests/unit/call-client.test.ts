import { describe, expect, it, vi } from "vitest";
import { AudioQueue, type FetchAudio } from "@/components/call/audioQueue";
import { isBrowserSttAllowed } from "@/components/call/browserStt";
import { callReducer, formatClock, initialCallState, mascotStateFor, type CallAction, type CallState } from "@/components/call/callState";
import { echoCheck } from "@/components/call/echoFilter";
import { EnergyVad, downsample, encodeWav } from "@/components/call/vadStt";

const run = (actions: CallAction[], s: CallState = initialCallState()) => actions.reduce(callReducer, s);
const connected: CallAction = {
  type: "CONNECTED",
  callId: "c1",
  maxSeconds: 300,
  stt: "browser",
  tts: "elevenlabs",
  nowMs: 1_000,
  greeting: "আসসালামু আলাইকুম",
};

describe("T2.5 FR-B3 call state machine", () => {
  it("goes idle -> requesting_mic -> connecting -> speaking (greeting)", () => {
    const s = run([{ type: "START" }, { type: "MIC_OK" }, connected]);
    expect(s.phase).toBe("speaking");
    expect(s.captions).toEqual([{ id: 1, speaker: "agent", text: "আসসালামু আলাইকুম" }]);
  });
  it("FR-B4 mic denied -> error", () => {
    expect(run([{ type: "START" }, { type: "MIC_ERROR", kind: "mic_denied" }])).toMatchObject({
      phase: "error",
      error: { kind: "mic_denied" },
    });
  });
  it("connect failure -> error with message (rate limit)", () => {
    const s = run([{ type: "START" }, { type: "MIC_OK" }, { type: "CONNECT_FAILED", kind: "rate_limited", message: "Too many" }]);
    expect(s).toMatchObject({ phase: "error", error: { kind: "rate_limited", message: "Too many" } });
  });
  it("live: listening -> final text -> thinking -> speaking -> listening", () => {
    let s = run([{ type: "START" }, { type: "MIC_OK" }, connected, { type: "LISTENING" }]);
    s = callReducer(s, { type: "INTERIM", text: "আমি" });
    expect(s.interim).toBe("আমি");
    s = callReducer(s, { type: "CALLER_FINAL", text: "আমি appointment চাই", inputMode: "voice" });
    expect(s).toMatchObject({ phase: "thinking", interim: "" });
    s = run([{ type: "AGENT_SENTENCE", text: "জি।" }, { type: "SPEAKING" }, { type: "LISTENING" }], s);
    expect(s.phase).toBe("listening");
    expect(s.captions.map((c) => c.speaker)).toEqual(["agent", "caller", "agent"]);
  });
  it("live sub-state actions are ignored outside a call", () => {
    expect(run([{ type: "SPEAKING" }, { type: "CALLER_FINAL", text: "x", inputMode: "typed" }]).phase).toBe("idle");
  });
  it("timer ticks only while live", () => {
    const s = run([{ type: "START" }, { type: "MIC_OK" }, connected, { type: "TICK", nowMs: 66_500 }]);
    expect(s.elapsedS).toBe(65);
    expect(formatClock(s.elapsedS)).toBe("1:05");
  });
  it("ending -> ended keeps the summary; providers can change only when idle/ended", () => {
    let s = run([{ type: "START" }, { type: "MIC_OK" }, connected, { type: "ENDING", reason: "agent_end" }]);
    expect(callReducer(s, { type: "SET_PROVIDERS", stt: "azure" }).sttProvider).toBe("browser");
    s = callReducer(s, { type: "ENDED", summary: "বুক হয়েছে" });
    expect(s).toMatchObject({ phase: "ended", summary: "বুক হয়েছে", endReason: "agent_end" });
    expect(callReducer(s, { type: "SET_PROVIDERS", stt: "azure" }).sttProvider).toBe("azure");
  });
  it("a new START from ended clears the old call", () => {
    const s = run([{ type: "START" }, { type: "MIC_OK" }, connected, { type: "ENDING", reason: "caller_hangup" }, { type: "ENDED" }, { type: "START" }]);
    expect(s).toMatchObject({ phase: "requesting_mic", captions: [] });
    expect(s.callId).toBeUndefined();
  });
  it("mascot state follows the call phase", () => {
    expect(mascotStateFor("listening")).toBe("listening");
    expect(mascotStateFor("connecting")).toBe("thinking");
    expect(mascotStateFor("speaking")).toBe("speaking");
    expect(mascotStateFor("ended")).toBe("idle");
  });
});

describe("T2.5 FR-C17 echo filter", () => {
  const agent = ["আপনার মোবাইল নাম্বারটা বলেন।", "আপনার মোবাইল নাম্বারটা বলেন।"];
  it("ignores fewer than 2 words", () => {
    expect(echoCheck("হ্যাঁ", agent)).toMatchObject({ accept: false, reason: "too_short" });
  });
  it("ignores the agent's own words picked up by the mic", () => {
    expect(echoCheck("মোবাইল নাম্বারটা বলেন", agent)).toMatchObject({ accept: false, reason: "echo" });
  });
  it("accepts real caller speech", () => {
    expect(echoCheck("না না, আমি কাল আসতে পারব না", agent).accept).toBe(true);
  });
  it("matches against the spoken ttsText too (digits read as words)", () => {
    expect(echoCheck("শূন্য এক সাত এক", ["01712345678", "শূন্য, এক, সাত, এক, দুই"])).toMatchObject({ accept: false });
  });
});

describe("T2.5 FR-B5 browser STT allowlist", () => {
  const chromeDesktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
  const chromeAndroid = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
  it("allows desktop and Android Chrome", () => {
    expect(isBrowserSttAllowed(chromeDesktop)).toBe(true);
    expect(isBrowserSttAllowed(chromeAndroid)).toBe(true);
  });
  it("blocks Edge, Safari, iOS Chrome and Samsung Internet", () => {
    expect(isBrowserSttAllowed(`${chromeDesktop} Edg/141.0.0.0`)).toBe(false);
    expect(isBrowserSttAllowed("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15")).toBe(false);
    expect(isBrowserSttAllowed("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isBrowserSttAllowed(`${chromeAndroid} SamsungBrowser/25.0`)).toBe(false);
  });
});

describe("T2.5 server STT clips (VAD + WAV)", () => {
  it("encodes a 16 kHz mono 16-bit WAV header", () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1]));
    const v = new DataView(wav);
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe("RIFF");
    expect(v.getUint32(24, true)).toBe(16_000);
    expect(v.getUint16(22, true)).toBe(1);
    expect(wav.byteLength).toBe(44 + 8);
    expect(v.getInt16(44 + 6, true)).toBe(0x7fff);
  });
  it("downsamples 48 kHz to 16 kHz", () => {
    expect(downsample(new Float32Array(4800), 48_000).length).toBe(1600);
  });
  it("emits one clip for speech followed by 700 ms of silence, ignores short noise", () => {
    const onClip = vi.fn();
    const vad = new EnergyVad(16_000, { onClip });
    const frame = (amp: number) => new Float32Array(1600).fill(amp); // 100 ms
    for (let i = 0; i < 5; i++) vad.push(frame(0.001));
    vad.push(frame(0.2)); // 100 ms noise blip
    for (let i = 0; i < 8; i++) vad.push(frame(0.001));
    expect(onClip).not.toHaveBeenCalled();
    for (let i = 0; i < 10; i++) vad.push(frame(0.2)); // 1 s speech
    for (let i = 0; i < 8; i++) vad.push(frame(0.001));
    expect(onClip).toHaveBeenCalledTimes(1);
    expect(onClip.mock.calls[0]![1]).toBeGreaterThan(1000);
  });
});

// --- AudioQueue with a fake AudioContext --------------------------------------------------

class FakeSource {
  buffer: { duration: number } | null = null;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  connect() {}
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
}

function fakeCtx() {
  const sources: FakeSource[] = [];
  const ctx = {
    currentTime: 0,
    destination: {},
    createAnalyser: () => ({ fftSize: 512, smoothingTimeConstant: 0, connect() {}, getByteTimeDomainData(a: Uint8Array) { a.fill(128); } }),
    createBufferSource: () => {
      const s = new FakeSource();
      sources.push(s);
      return s;
    },
    decodeAudioData: async (buf: ArrayBuffer) => ({ duration: buf.byteLength }),
  };
  return { ctx: ctx as unknown as AudioContext, sources, raw: ctx };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("T2.5 audio queue", () => {
  it("plays strictly in order with at most 2 fetches in flight", async () => {
    const { ctx, sources } = fakeCtx();
    const resolvers: Array<(b: ArrayBuffer) => void> = [];
    const fetchAudio: FetchAudio = vi.fn(() => new Promise<ArrayBuffer>((r) => resolvers.push(r)));
    const q = new AudioQueue(ctx, fetchAudio);
    q.enqueue(0, "sentence", "এক।", "এক।");
    q.enqueue(1, "sentence", "দুই।", "দুই।");
    q.enqueue(2, "sentence", "তিন।", "তিন।");
    expect(fetchAudio).toHaveBeenCalledTimes(2);
    resolvers[1]!(new ArrayBuffer(2)); // second arrives first
    await flush();
    expect(sources).toHaveLength(0); // waits for the first
    resolvers[0]!(new ArrayBuffer(2));
    await flush();
    expect(sources).toHaveLength(1);
    expect(fetchAudio).toHaveBeenCalledTimes(3);
  });

  it("FR-C17 stop() returns the spoken prefix (played + current if over 50%)", async () => {
    const { ctx, sources, raw } = fakeCtx();
    const onIdle = vi.fn();
    const q = new AudioQueue(ctx, async () => new ArrayBuffer(10), { onIdle });
    q.resetTurn();
    q.enqueue(0, "sentence", "প্রথম বাক্য।", "প্রথম বাক্য।");
    q.enqueue(1, "sentence", "দ্বিতীয় বাক্য।", "দ্বিতীয় বাক্য।");
    await flush();
    await flush();
    sources[0]!.onended!();
    await flush();
    raw.currentTime = 6; // 60% of the 10 s second sentence
    const r = q.stop();
    expect(r).toEqual({ interrupted: true, seq: 1, spokenPrefix: "প্রথম বাক্য। দ্বিতীয় বাক্য।" });
    expect(sources[1]!.stopped).toBe(true);
    expect(q.isActive()).toBe(false);
  });
});

describe("BrowserStt end of turn (TC-04: Chrome never sent a final result)", async () => {
  const { BrowserStt } = await import("@/components/call/browserStt");

  class FakeRec {
    static last: FakeRec;
    lang = "";
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    starts = 0;
    aborts = 0;
    constructor() {
      FakeRec.last = this;
    }
    start() {
      this.starts++;
    }
    stop() {}
    abort() {
      this.aborts++;
      this.onend?.();
    }
    say(text: string, isFinal: boolean, index = 0) {
      const r = Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal });
      const results = Object.assign([] as unknown[], { length: index + 1 });
      results[index] = r;
      this.onresult?.({ resultIndex: index, results });
    }
  }

  function make() {
    const finals: string[] = [];
    const stt = new BrowserStt({
      lang: "bn-BD",
      onInterim: () => undefined,
      onFinal: (t) => finals.push(t),
      onError: () => undefined,
      ctor: FakeRec as never,
    });
    stt.start();
    return { stt, finals, rec: () => FakeRec.last };
  }

  it("promotes interim text that stops changing, and aborts so it is not sent twice", () => {
    vi.useFakeTimers();
    const { stt, finals, rec } = make();
    const r = rec();
    r.say("০১৮৬৭৬৪৩৮৬৬", false);
    vi.advanceTimersByTime(1500 + 700 + 200);
    expect(finals).toEqual(["০১৮৬৭৬৪৩৮৬৬".normalize("NFC")]);
    expect(r.aborts).toBe(1);
    expect(r.starts).toBe(2); // restarted after the abort
    stt.stop();
    vi.useRealTimers();
  });

  it("keeps interim text when the session ends before a final result", () => {
    vi.useFakeTimers();
    const { stt, finals, rec } = make();
    rec().say("জিরো ওয়ান এইট", false);
    rec().onend?.();
    vi.advanceTimersByTime(900);
    expect(finals).toEqual(["জিরো ওয়ান এইট".normalize("NFC")]);
    stt.stop();
    vi.useRealTimers();
  });

  it("normal final results still work and are not doubled", () => {
    vi.useFakeTimers();
    const { stt, finals, rec } = make();
    rec().say("হ্যাঁ ঠিক", false);
    rec().say("হ্যাঁ ঠিক আছে", true);
    vi.advanceTimersByTime(3000);
    expect(finals).toEqual(["হ্যাঁ ঠিক আছে".normalize("NFC")]);
    expect(rec().aborts).toBe(0);
    stt.stop();
    vi.useRealTimers();
  });
});

describe("short answers are not echo (TC-06)", async () => {
  const { isShortAnswer } = await import("@/components/call/echoFilter");
  it("recognises yes/no answers in Bangla and English", () => {
    for (const t of ["ঠিক আছে", "হ্যাঁ ঠিক আছে", "জি", "না", "yes", "OK", "হ্যাঁ বুক করেন"]) {
      expect(isShortAnswer(t.normalize("NFC")), t).toBe(true);
    }
  });
  it("does not treat real sentences as short answers", () => {
    for (const t of ["আমার দাঁতে ব্যথা", "আপনার নম্বর শূন্য এক আট ঠিক আছে", "কাল বিকেলে আসতে চাই"]) {
      expect(isShortAnswer(t.normalize("NFC")), t).toBe(false);
    }
  });
  it("echoCheck alone would drop ঠিক আছে after the agent's '..., ঠিক আছে?'", () => {
    const agent = ["আপনার নম্বর শূন্য, এক, আট, ঠিক আছে?".normalize("NFC")];
    expect(echoCheck("ঠিক আছে".normalize("NFC"), agent).accept).toBe(false);
  });
});
