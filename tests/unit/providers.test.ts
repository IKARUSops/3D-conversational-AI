import { afterEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import type { FetchLike } from "@/lib/providers/common";
import {
  AllProvidersFailedError,
  chainFrom,
  providerAvailability,
  synthesizeWithFallback,
  transcribeClipWithFallback,
} from "@/lib/providers/registry";
import { createAzureStt } from "@/lib/providers/stt/azure";
import { createElevenLabsStt, wordsToSegments } from "@/lib/providers/stt/elevenlabs";
import { createOpenAiStt } from "@/lib/providers/stt/openai";
import { buildSsml } from "@/lib/providers/tts/azure";
import { createElevenLabsTts } from "@/lib/providers/tts/elevenlabs";
import type { ResolvedKey } from "@/lib/providers/types";

const key = (value: string): ResolvedKey => ({ value, source: "platform", meta: { region: "southeastasia" } });
const allKeys = async () => key("k");

function audioResponse(bytes = [1, 2, 3]): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<number[]> {
  const out: number[] = [];
  const r = stream.getReader();
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    out.push(...value);
  }
  return out;
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("T2.3 STT adapters (mocked fetch)", () => {
  it("ElevenLabs uses batch Scribe scribe_v2 with language ben", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => Response.json({ text: " হ্যালো " }));
    const stt = createElevenLabsStt("xi-key", fetchImpl);
    const r = await stt.transcribe(new ArrayBuffer(100), { lang: "bn" });
    expect(r.text).toBe("হ্যালো");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect((init!.headers as Record<string, string>)["xi-api-key"]).toBe("xi-key");
    const fd = init!.body as FormData;
    expect(fd.get("model_id")).toBe("scribe_v2");
    expect(fd.get("language_code")).toBe("ben");
  });

  it("ElevenLabs words become timed segments", () => {
    const segs = wordsToSegments([
      { text: "আমি", start: 0, end: 0.3, type: "word" },
      { text: " ", type: "spacing" },
      { text: "আসব।", start: 0.4, end: 0.8, type: "word" },
      { text: "কাল", start: 3, end: 3.4, type: "word" },
    ]);
    expect(segs).toEqual([
      { startMs: 0, endMs: 800, text: "আমি আসব।" },
      { startMs: 3000, endMs: 3400, text: "কাল" },
    ]);
  });

  it("OpenAI uses gpt-transcribe by default and env override", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => Response.json({ text: "ok" }));
    await createOpenAiStt("sk", fetchImpl).transcribe(new ArrayBuffer(10), { lang: "bn" });
    expect((fetchImpl.mock.calls[0]![1]!.body as FormData).get("model")).toBe("gpt-transcribe");
    vi.stubEnv("OPENAI_STT_MODEL", "gpt-live-transcribe");
    await createOpenAiStt("sk", fetchImpl).transcribe(new ArrayBuffer(10), { lang: "bn" });
    expect((fetchImpl.mock.calls[1]![1]!.body as FormData).get("model")).toBe("gpt-live-transcribe");
  });

  it("Azure short audio uses bn-IN and treats NoMatch as empty text", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => Response.json({ RecognitionStatus: "NoMatch" }));
    const r = await createAzureStt("az", "southeastasia", fetchImpl).transcribe(new ArrayBuffer(10), { lang: "bn" });
    expect(r.text).toBe("");
    expect(String(fetchImpl.mock.calls[0]![0])).toContain("language=bn-IN");
  });
});

describe("T2.3 TTS adapters (mocked fetch)", () => {
  it("ElevenLabs streams eleven_v4 with the owner's voice and mp3_44100_128", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => audioResponse());
    const tts = createElevenLabsTts({ apiKey: "xi", fetchImpl });
    await readAll(await tts.stream("হ্যালো", { lang: "bn" }));
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/8U6QQz51HQvOsmbnTJ3D/stream?output_format=mp3_44100_128",
    );
    expect(JSON.parse(String(init!.body))).toMatchObject({ text: "হ্যালো", model_id: "eleven_v4" });
  });

  it("Azure SSML uses bn-BD-NabanitaNeural and escapes text", () => {
    const ssml = buildSsml("<a> & b", "bn");
    expect(ssml).toContain('voice name="bn-BD-NabanitaNeural"');
    expect(ssml).toContain("&lt;a&gt; &amp; b");
  });
});

describe("T2.3 FR-C14 fallback chain", () => {
  it("chain starts at the chosen provider", () => {
    expect(chainFrom(["elevenlabs", "openai", "azure"], "openai")).toEqual(["openai", "azure"]);
  });

  it("TTS falls back to OpenAI when ElevenLabs fails and logs provider_fallback", async () => {
    const log = vi.fn(async () => undefined);
    const fetchImpl = vi.fn<FetchLike>(async (url) =>
      String(url).includes("elevenlabs") ? new Response("quota", { status: 401 }) : audioResponse([9, 9]),
    );
    const r = await synthesizeWithFallback(
      { text: "হ্যালো", lang: "bn", start: "elevenlabs", callId: "c1" },
      { resolveKey: allKeys, fetchImpl, log },
    );
    expect(r.provider).toBe("openai");
    expect(r.fallbackFrom).toBe("elevenlabs");
    expect(await readAll(r.stream)).toEqual([9, 9]);
    expect(log).toHaveBeenCalledWith("c1", "provider_fallback", expect.objectContaining({ kind: "tts", from: "elevenlabs", to: "openai" }));
  });

  it("TTS moves on when the first byte does not arrive in time", async () => {
    const fetchImpl = vi.fn<FetchLike>((url, init) =>
      String(url).includes("elevenlabs")
        ? new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))
        : Promise.resolve(audioResponse([7])),
    );
    const r = await synthesizeWithFallback(
      { text: "x", lang: "bn", start: "elevenlabs" },
      { resolveKey: allKeys, fetchImpl, timeouts: { ttsFirstByte: 30 } },
    );
    expect(r.provider).toBe("openai");
  });

  it("skips providers without a key", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => audioResponse());
    const r = await synthesizeWithFallback(
      { text: "x", lang: "bn", start: "elevenlabs" },
      { resolveKey: async (p) => (p === "azure" ? key("az") : null), fetchImpl },
    );
    expect(r.provider).toBe("azure");
    expect(r.fallbackFrom).toBeUndefined();
  });

  it("STT throws AllProvidersFailedError when every provider fails", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response("err", { status: 500 }));
    await expect(
      transcribeClipWithFallback({ wav: new ArrayBuffer(10), lang: "bn", start: "elevenlabs" }, { resolveKey: allKeys, fetchImpl }),
    ).rejects.toBeInstanceOf(AllProvidersFailedError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("STT falls back from ElevenLabs to OpenAI", async () => {
    const fetchImpl = vi.fn<FetchLike>(async (url) =>
      String(url).includes("elevenlabs") ? new Response("x", { status: 503 }) : Response.json({ text: "জি" }),
    );
    const r = await transcribeClipWithFallback(
      { wav: new ArrayBuffer(10), lang: "bn", start: "elevenlabs" },
      { resolveKey: allKeys, fetchImpl },
    );
    expect(r).toMatchObject({ text: "জি", provider: "openai", fallbackFrom: "elevenlabs" });
  });
});

describe("T2.3 FR-B2 GET /api/providers availability", () => {
  it("marks providers without platform keys as unavailable and never exposes keys", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "secret-el");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("AZURE_SPEECH_KEY", "");
    resetEnvCache();
    const r = providerAvailability();
    expect(r.stt.find((s) => s.id === "browser")).toMatchObject({ available: true, isDefault: true });
    expect(r.tts.find((s) => s.id === "elevenlabs")).toMatchObject({ available: true, isDefault: true });
    expect(r.tts.find((s) => s.id === "openai")).toMatchObject({ available: false, reason: "No key configured" });
    expect(JSON.stringify(r)).not.toContain("secret-el");
  });
});
