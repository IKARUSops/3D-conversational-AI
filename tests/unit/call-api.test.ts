import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { recordingPath } from "@/contracts";
import { verifyCallToken } from "@/lib/call-token";
import { resetEnvCache } from "@/lib/env";
import { windowStart, DAY_MS, HOUR_MS } from "@/lib/rate-limit";
import { chooseProviders } from "@/lib/services/providers-choice";
import { testDb } from "../support/db-mock";
import { startTestDb, type TestDb } from "../support/pglite-db";
import { seedTestClinic, type SeededClinic } from "../support/seed-test";

const afterTasks: Array<() => unknown> = [];
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => afterTasks.push(fn),
}));
vi.mock("@/lib/db", () => import("../support/db-mock"));
const uploads: string[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => {
          uploads.push(path);
          return {
            data: { signedUrl: `https://sb.example/upload/${path}?token=t`, token: "t", path },
            error: null,
          };
        },
      }),
    },
  }),
}));

const SECRET = "x".repeat(40);
Object.assign(process.env, {
  CALL_TOKEN_SECRET: SECRET,
  IP_HASH_SALT: "salt",
  DATABASE_URL: "postgres://test",
  GOOGLE_GENERATIVE_AI_API_KEY: "g",
  REVIEW_KEY: "review-key-123",
  RATE_LIMIT_CALLS_PER_IP_HOUR: "3",
  DAILY_CALL_CAP: "6",
  ELEVENLABS_API_KEY: "el",
  OPENAI_API_KEY: "",
  AZURE_SPEECH_KEY: "",
});
resetEnvCache();

const startRoute = await import("@/app/api/calls/route");
const endRoute = await import("@/app/api/calls/[id]/end/route");
const recRoute = await import("@/app/api/calls/[id]/recording-url/route");
const demoRoute = await import("@/app/api/demo-requests/route");

let t: TestDb;
let seeded: SeededClinic;

beforeAll(async () => {
  t = await startTestDb();
  testDb.prisma = t.prisma;
  seeded = await seedTestClinic(t.prisma);
}, 60_000);
afterAll(async () => {
  await t?.stop();
});
beforeEach(async () => {
  afterTasks.length = 0;
  await t.prisma.rateLimit.deleteMany();
});

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function start(extra: Record<string, unknown> = {}, ip = "203.0.113.7") {
  const res = await startRoute.POST(
    post(
      "/api/calls",
      { sttProvider: "browser", ttsProvider: "elevenlabs", ...extra },
      { "x-forwarded-for": ip },
    ),
  );
  return {
    res,
    body: (await res.json()) as Record<string, unknown> & { callId: string; callToken: string },
  };
}

describe("POST /api/calls (T1.5, FR-B12)", () => {
  it("I-09 answers 503 with a clear message when the server has no env", async () => {
    const saved = process.env.CALL_TOKEN_SECRET;
    delete process.env.CALL_TOKEN_SECRET;
    resetEnvCache();
    try {
      const { res, body } = await start();
      expect(res.status).toBe(503);
      expect(JSON.stringify(body)).toContain("not configured");
    } finally {
      process.env.CALL_TOKEN_SECRET = saved;
      resetEnvCache();
    }
  });

  it("starts a call: greeting, token, row, greeting turn, event", async () => {
    const { res, body } = await start();
    expect(res.status).toBe(201);
    expect(body.greeting).toEqual({
      text: "আসসালামু আলাইকুম, ঢাকা ডেন্টাল কেয়ারে আপনাকে স্বাগতম। আমি নাদিয়া, বলেন কীভাবে সাহায্য করতে পারি?",
      ttsText: expect.any(String),
    });
    expect(body.maxSeconds).toBe(300);
    expect(body.providers).toEqual({ stt: "browser", tts: "elevenlabs" });
    const v = verifyCallToken(body.callToken, SECRET);
    expect(v.ok && v.payload.callId).toBe(body.callId);
    const call = await t.prisma.call.findUniqueOrThrow({
      where: { id: body.callId },
      include: { turns: true, events: true },
    });
    expect(call.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(call.ipHash).not.toContain("203.0.113.7");
    expect(call.processingState).toBe("pending");
    expect(call.agentState).toMatchObject({ offTopicStreak: 0, lang: "bn" });
    expect(call.turns.map((x) => [x.seq, x.speaker])).toEqual([[0, "agent"]]);
    expect(call.events.map((e) => e.type)).toEqual(["call_started"]);
    expect(afterTasks).toHaveLength(1);
  });

  it("rejects an invalid body with 400", async () => {
    const res = await startRoute.POST(post("/api/calls", { sttProvider: "nope" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_request");
  });

  it("unknown clinic is 404", async () => {
    expect((await start({ clinicSlug: "nope" })).res.status).toBe(404);
  });

  it("per-IP limit gives 429 rate_limited with Retry-After; review key skips it", async () => {
    for (let i = 0; i < 3; i++) expect((await start({}, "198.51.100.1")).res.status).toBe(201);
    const blocked = await start({}, "198.51.100.1");
    expect(blocked.res.status).toBe(429);
    expect(blocked.res.headers.get("Retry-After")).toBeTruthy();
    expect((blocked.body as unknown as { error: { code: string } }).error.code).toBe(
      "rate_limited",
    );
    expect((await start({ reviewKey: "review-key-123" }, "198.51.100.1")).res.status).toBe(201);
    expect((await start({ reviewKey: "wrong" }, "198.51.100.1")).res.status).toBe(429);
  });

  it("daily cap gives 429 daily_cap", async () => {
    for (let i = 0; i < 6; i++) expect((await start({}, `192.0.2.${i}`)).res.status).toBe(201);
    const capped = await start({ reviewKey: "review-key-123" }, "192.0.2.99");
    expect(capped.res.status).toBe(429);
    expect((capped.body as unknown as { error: { code: string } }).error.code).toBe("daily_cap");
  });

  it("STT without a key falls back; BYOK key sets keySource", async () => {
    const { body } = await start({ sttProvider: "openai", ttsProvider: "azure" }, "192.0.2.200");
    expect(body.providers).toEqual({ stt: "elevenlabs", tts: "elevenlabs" });
    await t.prisma.providerKey.create({
      data: {
        clinicId: seeded.clinic.id,
        provider: "azure",
        ciphertext: "c",
        iv: "i",
        authTag: "a",
        last4: "abcd",
      },
    });
    const b2 = await start({ ttsProvider: "azure" }, "192.0.2.201");
    expect(b2.body.providers).toEqual({ stt: "browser", tts: "azure" });
    const call = await t.prisma.call.findUniqueOrThrow({ where: { id: b2.body.callId } });
    expect(call.keySource).toBe("byok");
  });
});

describe("POST /api/calls/:id/recording-url and /end (T1.5, AT-22, FR-B14)", () => {
  it("rejects a missing or wrong call token (AT-22)", async () => {
    const { body } = await start({}, "192.0.2.50");
    const other = await start({}, "192.0.2.51");
    expect(
      (await endRoute.POST(post("/x", { reason: "caller_hangup" }), params(body.callId))).status,
    ).toBe(401);
    const wrong = post(
      "/x",
      { reason: "caller_hangup" },
      { authorization: `Bearer ${other.body.callToken}` },
    );
    expect((await endRoute.POST(wrong, params(body.callId))).status).toBe(401);
    expect(
      (await recRoute.POST(post("/x", { contentType: "audio/webm" }), params(body.callId))).status,
    ).toBe(401);
  });

  it("gives a signed upload URL for the call's own path", async () => {
    const { body } = await start({}, "192.0.2.52");
    const res = await recRoute.POST(
      post("/x", { contentType: "audio/webm" }, { authorization: `Bearer ${body.callToken}` }),
      params(body.callId),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { path: string; uploadUrl: string };
    expect(json.path).toBe(recordingPath(seeded.clinic.id, body.callId));
    expect(uploads).toContain(json.path);
  });

  it("ends with the header token, schedules finalize once, second end (beacon, token in body) is idempotent", async () => {
    const { body } = await start({}, "192.0.2.53");
    afterTasks.length = 0;
    const path = recordingPath(seeded.clinic.id, body.callId);
    const r1 = await endRoute.POST(
      post(
        "/x",
        { reason: "caller_hangup", recordingPath: path },
        { authorization: `Bearer ${body.callToken}` },
      ),
      params(body.callId),
    );
    expect(r1.status).toBe(200);
    expect(afterTasks).toHaveLength(1);
    const call = await t.prisma.call.findUniqueOrThrow({ where: { id: body.callId } });
    expect(call).toMatchObject({ endReason: "caller_hangup", recordingPath: path });
    expect(call.endedAt).not.toBeNull();

    // Finalize claims the call; a later beacon must not schedule it again.
    await t.prisma.call.update({ where: { id: body.callId }, data: { processingState: "done" } });
    const beacon = new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ reason: "tab_closed", token: body.callToken }),
    });
    const r2 = await endRoute.POST(beacon, params(body.callId));
    expect(r2.status).toBe(200);
    expect(afterTasks).toHaveLength(1);
    expect((await t.prisma.call.findUniqueOrThrow({ where: { id: body.callId } })).endReason).toBe(
      "caller_hangup",
    );
    // Ended calls cannot get an upload URL any more.
    const rec = await recRoute.POST(
      post("/x", { contentType: "audio/webm" }, { authorization: `Bearer ${body.callToken}` }),
      params(body.callId),
    );
    expect(rec.status).toBe(409);
  });

  it("ignores a recording path that is not the call's own", async () => {
    const { body } = await start({}, "192.0.2.54");
    await endRoute.POST(
      post("/x", {
        reason: "agent_end",
        recordingPath: "clinic/other/calls/x.webm",
        token: body.callToken,
      }),
      params(body.callId),
    );
    expect(
      (await t.prisma.call.findUniqueOrThrow({ where: { id: body.callId } })).recordingPath,
    ).toBeNull();
  });
});

describe("POST /api/demo-requests (FR-A7)", () => {
  const form = { name: "রহিম", clinicName: "Smile Dental", phone: "01712345678", email: "" };
  it("stores a request and limits 5 per IP per hour", async () => {
    for (let i = 0; i < 5; i++) expect((await demoRoute.POST(post("/x", form))).status).toBe(201);
    expect((await demoRoute.POST(post("/x", form))).status).toBe(429);
    const row = await t.prisma.demoRequest.findFirstOrThrow();
    expect(row).toMatchObject({ name: "রহিম", email: null });
    expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("rejects invalid input", async () => {
    expect((await demoRoute.POST(post("/x", { name: "A" }))).status).toBe(400);
  });
});

describe("rate limit windows and provider choice (T1.5)", () => {
  it("hour windows start on the hour, day windows at Dhaka midnight", () => {
    const now = new Date("2026-11-04T19:30:00Z"); // 01:30 on 5 Nov in Dhaka
    expect(windowStart(now, HOUR_MS).toISOString()).toBe("2026-11-04T19:00:00.000Z");
    expect(windowStart(now, DAY_MS).toISOString()).toBe("2026-11-04T18:00:00.000Z");
  });
  it("keeps a provider with a key and falls back in order", () => {
    const keys = {
      platform: new Set(["openai" as const]),
      byok: new Set<"elevenlabs" | "openai" | "azure">(),
    };
    expect(chooseProviders({ stt: "elevenlabs", tts: "elevenlabs" }, keys)).toEqual({
      stt: "openai",
      tts: "openai",
      keySource: "platform",
    });
    expect(chooseProviders({ stt: "browser", tts: "openai" }, keys).stt).toBe("browser");
  });
});
