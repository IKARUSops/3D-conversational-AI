/**
 * I-08 full flow (integration): real route handlers + real services + real turn loop on a PGlite
 * database, with a scripted mock LLM (ai/test MockLanguageModelV4) and mocked post-call AI.
 *
 * POST /api/calls -> POST /api/calls/:id/turn (SSE) x N -> recording-url -> /end -> finalize.
 * Scenarios: booked (FR-C5), rescheduled by the same phone (FR-C7), medical callback (FR-C10).
 */
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TurnEvent } from "@/contracts";
import { readSse } from "@/lib/agent/sse";
import { resetEnvCache } from "@/lib/env";
import { testDb } from "../support/db-mock";
import { startTestDb, type TestDb } from "../support/pglite-db";
import { seedTestClinic } from "../support/seed-test";

// ---------------------------------------------------------------------------
// Mocks (hoisted)
// ---------------------------------------------------------------------------

type Prompt = unknown[];
type Step = (prompt: Prompt) => unknown[];

const h = vi.hoisted(() => ({
  afterTasks: [] as Array<() => unknown>,
  steps: [] as Array<(prompt: unknown[]) => unknown[]>,
  llms: [] as unknown[],
  extractions: [] as Array<{ agentState: unknown; liveTurns: unknown[] }>,
}));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => h.afterTasks.push(fn),
}));
vi.mock("@/lib/db", () => import("../support/db-mock"));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => ({
          data: { signedUrl: `https://sb.example/upload/${path}?token=t`, token: "t", path },
          error: null,
        }),
        download: async () => ({
          data: new Blob([new Uint8Array([26, 69, 223, 163])]),
          error: null,
        }),
      }),
    },
  }),
}));
vi.mock("@/lib/providers/registry", async (orig) => ({
  ...(await orig<typeof import("@/lib/providers/registry")>()),
  getLlmChain: () => h.llms,
}));
vi.mock("@/lib/agent/postcall", async (orig) => {
  const real = await orig<typeof import("@/lib/agent/postcall")>();
  return {
    ...real,
    transcribeRecording: vi.fn(async () => ({
      provider: "elevenlabs" as const,
      text: "আমি একটা অ্যাপয়েন্টমেন্ট নিতে চাই",
      segments: [{ startMs: 1200, endMs: 3400, text: "আমি একটা অ্যাপয়েন্টমেন্ট নিতে চাই" }],
    })),
    extractCallFields: vi.fn(async (input: Parameters<typeof real.extractCallFields>[0]) => {
      h.extractions.push({ agentState: input.agentState, liveTurns: input.liveTurns });
      return real.mergeExtraction(
        {
          offTopicTurns: 0,
          intent: "unknown",
          patientNameBn: null,
          patientNameEn: null,
          phoneRaw: null,
          reasonForVisit: null,
          serviceCode: null,
          doctorRequested: null,
          preferredDatetimeText: null,
          callerConfirmed: false,
          sentiment: "positive",
          languageMix: "bn",
          callbackCategory: null,
          summaryBn: "কলার অ্যাপয়েন্টমেন্ট নিয়েছেন।",
          summaryEn: "The caller handled an appointment.",
          confidence: {
            intent: 0.9,
            patientName: null,
            phone: null,
            reasonForVisit: null,
            serviceCode: null,
            preferredDatetime: null,
          },
        },
        input.agentState,
        "google:mock",
      );
    }),
    translateTurnsToEnglish: vi.fn(async (texts: string[]) => texts.map((_, i) => `EN ${i}`)),
  };
});

// ---------------------------------------------------------------------------
// Env, clock, routes
// ---------------------------------------------------------------------------

Object.assign(process.env, {
  CALL_TOKEN_SECRET: "s".repeat(40),
  IP_HASH_SALT: "salt",
  DATABASE_URL: "postgres://test",
  ELEVENLABS_API_KEY: "el",
  GOOGLE_GENERATIVE_AI_API_KEY: "g",
});
resetEnvCache();

// Wednesday 4 Nov 2026, 11:00 Dhaka. "আগামী রবিবার" = Sunday 8 Nov 2026.
const NOW = new Date("2026-11-04T11:00:00+06:00");
vi.useFakeTimers({ toFake: ["Date"], now: NOW });

const startRoute = await import("@/app/api/calls/route");
const turnRoute = await import("@/app/api/calls/[id]/turn/route");
const endRoute = await import("@/app/api/calls/[id]/end/route");
const recRoute = await import("@/app/api/calls/[id]/recording-url/route");
const postcall = await import("@/lib/agent/postcall");

// ---------------------------------------------------------------------------
// Scripted mock LLM
// ---------------------------------------------------------------------------

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};
let callIdCounter = 0;

/** One model step: optional text, then optional tool calls. */
function step(text: string | null, calls: Array<{ name: string; input: unknown }> = []): unknown[] {
  return [
    { type: "stream-start", warnings: [] },
    ...(text
      ? [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: text },
          { type: "text-end", id: "t" },
        ]
      : []),
    ...calls.map((c) => ({
      type: "tool-call",
      toolCallId: `tc${++callIdCounter}`,
      toolName: c.name,
      input: JSON.stringify(c.input),
    })),
    {
      type: "finish",
      usage,
      finishReason: { unified: calls.length ? "tool-calls" : "stop", raw: "x" },
    },
  ];
}

const model = new MockLanguageModelV4({
  doStream: async (opts) => {
    const next = h.steps.shift();
    if (!next) throw new Error("mock LLM: no scripted step left");
    const chunks = next(opts.prompt as Prompt);
    return {
      stream: simulateReadableStream({ chunks, chunkDelayInMs: 0 }) as never,
    };
  },
});
h.llms = [{ id: "google:mock", vendor: "google", model, providerOptions: {} }];

/** Output of the latest tool result with this name in the prompt (same turn, earlier step). */
function toolOutput<T = Record<string, unknown>>(prompt: Prompt, name: string): T {
  let found: unknown;
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.type === "tool-result" && o.toolName === name) found = o.output;
      Object.values(o).forEach(walk);
    }
  };
  walk(prompt);
  if (!found) throw new Error(`mock LLM: no ${name} result in prompt`);
  const out = found as { type?: string; value?: unknown };
  return (out.type === "json" ? out.value : out) as T;
}

/** System prompt text (carries "WHAT WE KNOW SO FAR" from the agent state). */
function systemText(prompt: Prompt): string {
  return (prompt as Array<{ role: string; content: unknown }>)
    .filter((m) => m.role === "system")
    .map((m) => String(m.content))
    .join("\n");
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const req = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9", ...headers },
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

interface Call {
  id: string;
  token: string;
  turnSeq: number;
  greeting: { text: string; ttsText: string };
}

async function startCall(): Promise<Call> {
  const res = await startRoute.POST(
    req("/api/calls", { sttProvider: "browser", ttsProvider: "elevenlabs", lang: "bn" }),
  );
  expect(res.status).toBe(201);
  const body = (await res.json()) as {
    callId: string;
    callToken: string;
    greeting: { text: string; ttsText: string };
  };
  return { id: body.callId, token: body.callToken, turnSeq: 0, greeting: body.greeting };
}

async function turn(call: Call, text: string, steps: Step[]): Promise<TurnEvent[]> {
  h.steps.push(...steps);
  call.turnSeq += 1;
  const res = await turnRoute.POST(
    req(
      `/api/calls/${call.id}/turn`,
      { turnSeq: call.turnSeq, text, inputMode: "voice", sttProvider: "browser", clientTs: 1 },
      { authorization: `Bearer ${call.token}` },
    ),
    params(call.id),
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const events: TurnEvent[] = [];
  await readSse(res.body!, (e) => events.push(e));
  expect(h.steps).toHaveLength(0); // every scripted step was used
  expect(events.at(-1)?.type).toBe("done");
  expect(events.some((e) => e.type === "error")).toBe(false);
  return events;
}

/** Sentence events: Bangla speakable text with no digits at all (FR-C3, SRS 2 section 7.5). */
function expectSpeakable(events: TurnEvent[]) {
  const sentences = events.filter(
    (e): e is Extract<TurnEvent, { type: "sentence" }> => e.type === "sentence",
  );
  expect(sentences.length).toBeGreaterThan(0);
  for (const s of sentences) {
    expect(s.ttsText).toMatch(/[ঀ-৿]/);
    expect(s.ttsText).not.toMatch(/[0-9০-৯]/);
  }
  return sentences;
}

async function endAndFinalize(call: Call, reason: "agent_end" | "caller_hangup" = "agent_end") {
  const rec = await recRoute.POST(
    req(
      `/api/calls/${call.id}/recording-url`,
      { contentType: "audio/webm" },
      {
        authorization: `Bearer ${call.token}`,
      },
    ),
    params(call.id),
  );
  expect(rec.status).toBe(200);
  const { path } = (await rec.json()) as { path: string };
  const res = await endRoute.POST(
    req(
      `/api/calls/${call.id}/end`,
      { reason, recordingPath: path },
      {
        authorization: `Bearer ${call.token}`,
      },
    ),
    params(call.id),
  );
  expect(res.status).toBe(200);
  // Run the after() work (finalize, stale sweep) synchronously.
  const tasks = h.afterTasks.splice(0);
  for (const t of tasks) await t();
}

const PHONE = "01712345678";
const NAME = "রহিম উদ্দিন";

let t: TestDb;

beforeAll(async () => {
  t = await startTestDb();
  testDb.prisma = t.prisma;
  await seedTestClinic(t.prisma);
}, 60_000);
afterAll(async () => {
  vi.useRealTimers();
  await t?.stop();
});

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe("I-08 full flow: start -> turns -> end -> finalize", () => {
  let bookedId = "";

  it("FR-C5 AT-1 books an appointment and finalizes as booked", async () => {
    const call = await startCall();
    const db = t.prisma;

    // Start: initial agent state + greeting as live agent turn seq 0 (I-02).
    expect(call.greeting.ttsText).not.toMatch(/[0-9]/);
    const row0 = await db.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(row0.agentState).toMatchObject({
      offTopicStreak: 0,
      silencePrompts: 0,
      lang: "bn",
      nextAgentSeq: 0,
    });
    const greet = await db.transcriptTurn.findMany({ where: { callId: call.id } });
    expect(greet).toMatchObject([
      { seq: 0, speaker: "agent", source: "live", textBn: call.greeting.text },
    ]);

    // Turn 1: name + phone, read back digits.
    const e1 = await turn(call, `আমার নাম ${NAME}, নাম্বার ০১৭১২৩৪৫৬৭৮`, [
      () =>
        step(null, [{ name: "save_patient_details", input: { nameBn: NAME, phoneRaw: PHONE } }]),
      (p) => {
        const out = toolOutput<{ phoneValid: boolean }>(p, "save_patient_details");
        expect(out.phoneValid).toBe(true);
        return step(`জি ${NAME}, আপনার নাম্বার ${PHONE}, ঠিক আছে?`);
      },
    ]);
    const s1 = expectSpeakable(e1);
    expect(s1[0]!.seq).toBe(0);
    expect(s1.map((s) => s.ttsText).join(" ")).toContain("শূন্য, এক, সাত");

    // Turn 2: caller confirms; agent asks for the day.
    const e2 = await turn(call, "জি, ঠিক আছে", [
      () =>
        step(null, [
          { name: "save_patient_details", input: { nameConfirmed: true, phoneConfirmed: true } },
        ]),
      () => step("ধন্যবাদ। কবে আসতে চান?"),
    ]);
    expect(expectSpeakable(e2)[0]!.seq).toBeGreaterThan(s1.at(-1)!.seq); // nextAgentSeq keeps rising

    // Turn 3: date words -> resolve_datetime -> check_availability -> offer slots.
    let offered: Array<{ start: string; doctorId: string; spokenBn: string }> = [];
    const e3 = await turn(call, "আগামী রবিবার সন্ধ্যায়, দাঁত পরিষ্কার করাব", [
      () => step(null, [{ name: "resolve_datetime", input: { phrase: "আগামী রবিবার সন্ধ্যায়" } }]),
      (p) => {
        const r = toolOutput<{ isoDate: string; partOfDay?: string; problems: string[] }>(
          p,
          "resolve_datetime",
        );
        expect(r.isoDate).toBe("2026-11-08");
        expect(r.partOfDay).toBe("evening");
        return step(null, [
          {
            name: "check_availability",
            input: { isoDate: r.isoDate, partOfDay: r.partOfDay, serviceCode: "scaling" },
          },
        ]);
      },
      (p) => {
        offered = toolOutput<{ slots: typeof offered }>(p, "check_availability").slots;
        expect(offered.length).toBeGreaterThan(0);
        return step(`${NAME}, শেষ চার ৫৬৭৮, স্কেলিং, ${offered[0]!.spokenBn}। বুক করব, ঠিক আছে?`);
      },
    ]);
    expectSpeakable(e3);
    expect(e3.filter((e) => e.type === "tool").map((e) => (e as { name: string }).name)).toEqual(
      expect.arrayContaining(["resolve_datetime", "check_availability"]),
    );

    // Turn 4 (next request): the LLM only has the prompt summary to find slotStart + doctorId.
    const e4 = await turn(call, "হ্যাঁ, প্রথমটা দেন", [
      (p) => {
        const sys = systemText(p);
        const m = /slotStart=(\S+) doctorId=(\S+)/.exec(sys);
        expect(m, "offered slot details in the system prompt").not.toBeNull();
        return step(null, [
          {
            name: "book_appointment",
            input: {
              slotStart: m![1],
              doctorId: m![2],
              serviceCode: "scaling",
              reason: "দাঁত পরিষ্কার",
              callerConfirmed: true,
            },
          },
        ]);
      },
      (p) => {
        const out = toolOutput<{ ok: boolean; appointmentId: string }>(p, "book_appointment");
        expect(out.ok).toBe(true);
        bookedId = out.appointmentId;
        return step(
          `আপনার appointment কনফার্ম হয়েছে, রবিবার ৮ নভেম্বর সন্ধ্যা ৬টায়। আল্লাহ হাফেজ।`,
          [
            {
              name: "end_call",
              input: { reason: "booked", summaryBn: "রবিবার স্কেলিং বুক হয়েছে।" },
            },
          ],
        );
      },
    ]);
    expectSpeakable(e4);
    expect(e4.find((e) => e.type === "end_call")).toMatchObject({ reason: "booked" });

    // Activity is tracked on every turn (I-03): stale sweep must not end this call.
    const live = await db.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(live.lastActivityAt.getTime()).toBe(NOW.getTime());
    expect(live.agentState).toMatchObject({ lastTurnSeq: 4, appointmentId: bookedId });

    await endAndFinalize(call);

    // Assertions on the finished call.
    const appt = await db.appointment.findUniqueOrThrow({ where: { id: bookedId } });
    expect(appt).toMatchObject({
      status: "booked",
      createdByCallId: call.id,
      doctorId: offered[0]!.doctorId,
    });
    expect(appt.slotStart.toISOString()).toBe(new Date(offered[0]!.start).toISOString());
    const hist = await db.appointmentHistory.findMany({ where: { appointmentId: bookedId } });
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ action: "created", callId: call.id });

    const done = await db.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(done).toMatchObject({
      status: "booked",
      processingState: "done",
      endReason: "agent_end",
    });
    expect(done.patientId).toBe(appt.patientId);
    expect(done.summaryEn).toBe("The caller handled an appointment.");
    expect(done.metrics).toMatchObject({ turns: 4 });

    const live2 = await db.transcriptTurn.findMany({
      where: { callId: call.id, source: "live" },
      orderBy: { seq: "asc" },
    });
    expect(live2.map((x) => x.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(live2.map((x) => x.speaker)).toEqual([
      "agent",
      "caller",
      "agent",
      "caller",
      "agent",
      "caller",
      "agent",
      "caller",
      "agent",
    ]);
    expect(live2.every((x) => x.textEn?.startsWith("EN"))).toBe(true);
    const batch = await db.transcriptTurn.findMany({ where: { callId: call.id, source: "batch" } });
    expect(batch).toHaveLength(1);

    const events = await db.callEvent.findMany({ where: { callId: call.id } });
    const types = events.map((e) => e.type);
    for (const type of [
      "call_started",
      "tool_call",
      "tool_result",
      "turn_latency",
      "call_ended",
      "finalize_started",
      "finalize_done",
    ]) {
      expect(types, type).toContain(type);
    }
    const toolNames = events
      .filter((e) => e.type === "tool_call")
      .map((e) => (e.payload as { name: string }).name);
    expect(toolNames).toEqual([
      "save_patient_details",
      "save_patient_details",
      "resolve_datetime",
      "check_availability",
      "book_appointment",
      "end_call",
    ]);

    const ex = await db.callExtraction.findUniqueOrThrow({ where: { callId: call.id } });
    expect(ex).toMatchObject({ phoneValid: true, intent: "book" });
    expect(vi.mocked(postcall.transcribeRecording)).toHaveBeenCalledTimes(1);
  });

  it("FR-C7 AT-4 reschedules in a new call by the same phone", async () => {
    const call = await startCall();
    await turn(call, `আমার appointment পরিবর্তন করতে চাই, নাম্বার ${PHONE}`, [
      () =>
        step(null, [
          { name: "save_patient_details", input: { phoneRaw: PHONE, phoneConfirmed: true } },
        ]),
      () => step(null, [{ name: "find_appointments", input: {} }]),
      (p) => {
        const found = toolOutput<{
          appointments: Array<{ appointmentId: string; spokenBn: string }>;
        }>(p, "find_appointments");
        expect(found.appointments.map((a) => a.appointmentId)).toEqual([bookedId]);
        return step(`আপনার ${found.appointments[0]!.spokenBn} এর appointment আছে। কবে নিতে চান?`);
      },
    ]);
    await turn(call, "মঙ্গলবার সকালে", [
      () => step(null, [{ name: "resolve_datetime", input: { phrase: "মঙ্গলবার সকালে" } }]),
      (p) => {
        const r = toolOutput<{ isoDate: string; partOfDay?: string }>(p, "resolve_datetime");
        expect(r.isoDate).toBe("2026-11-10");
        return step(null, [
          {
            name: "check_availability",
            input: { isoDate: r.isoDate, partOfDay: r.partOfDay, serviceCode: "scaling" },
          },
        ]);
      },
      (p) =>
        step(
          `${toolOutput<{ slots: Array<{ spokenBn: string }> }>(p, "check_availability").slots[0]!.spokenBn} খালি আছে, দিব?`,
        ),
    ]);
    const e3 = await turn(call, "জি দেন", [
      (p) => {
        const sys = systemText(p);
        const appt = /appointmentId=(\S+)/.exec(sys)?.[1];
        const slot = /slotStart=(\S+) doctorId=(\S+)/.exec(sys);
        expect(appt).toBe(bookedId);
        return step(null, [
          {
            name: "reschedule_appointment",
            input: {
              appointmentId: appt,
              newSlotStart: slot![1],
              newDoctorId: slot![2],
              callerConfirmed: true,
            },
          },
        ]);
      },
      (p) => {
        expect(toolOutput<{ ok: boolean }>(p, "reschedule_appointment").ok).toBe(true);
        return step("ঠিক আছে, পরিবর্তন হয়েছে। ভালো থাকবেন।", [
          {
            name: "end_call",
            input: { reason: "rescheduled", summaryBn: "অ্যাপয়েন্টমেন্ট মঙ্গলবারে সরানো হয়েছে।" },
          },
        ]);
      },
    ]);
    expectSpeakable(e3);
    await endAndFinalize(call);

    const db = t.prisma;
    const done = await db.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(done).toMatchObject({ status: "rescheduled", processingState: "done" });
    const appt = await db.appointment.findUniqueOrThrow({ where: { id: bookedId } });
    expect(appt.status).toBe("rescheduled");
    expect(appt.slotStart.toISOString().slice(0, 10)).toBe("2026-11-10");
    const hist = await db.appointmentHistory.findMany({
      where: { appointmentId: bookedId },
      orderBy: { at: "asc" },
    });
    expect(hist.map((x) => x.action)).toEqual(["created", "rescheduled"]);
    expect(hist[1]!.callId).toBe(call.id);
  });

  it("FR-C10 AT-7 medical question becomes a callback: follow_up_needed", async () => {
    const call = await startCall();
    const e1 = await turn(call, "দাঁতে খুব ব্যথা, কোন ওষুধ খাব?", [
      () =>
        step(
          "দুঃখিত, ওষুধের বিষয়ে আমি পরামর্শ দিতে পারি না। ডাক্তার আপনাকে কল করবেন, আপনার নাম আর নাম্বার বলবেন?",
        ),
    ]);
    expectSpeakable(e1);
    const e2 = await turn(call, `${NAME}, ${PHONE}`, [
      () =>
        step(null, [
          {
            name: "save_patient_details",
            input: { nameBn: NAME, nameConfirmed: true, phoneRaw: PHONE, phoneConfirmed: true },
          },
        ]),
      () =>
        step(null, [
          {
            name: "create_callback",
            input: {
              category: "medical",
              reason: "দাঁতে ব্যথা, ওষুধ জানতে চান",
              priority: "normal",
            },
          },
        ]),
      (p) => {
        expect(toolOutput<{ ok: boolean }>(p, "create_callback").ok).toBe(true);
        return step("ঠিক আছে, ডাক্তার আপনাকে কল করবেন। আল্লাহ হাফেজ।", [
          {
            name: "end_call",
            input: { reason: "callback", summaryBn: "ওষুধের প্রশ্ন, স্টাফ কল করবেন।" },
          },
        ]);
      },
    ]);
    expectSpeakable(e2);
    expect(e2.some((e) => e.type === "filler")).toBe(true); // slow tool before the first sentence
    await endAndFinalize(call);

    const db = t.prisma;
    const done = await db.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(done).toMatchObject({ status: "follow_up_needed", processingState: "done" });
    const cb = await db.callback.findMany({ where: { callId: call.id } });
    expect(cb).toHaveLength(1);
    expect(cb[0]).toMatchObject({ category: "medical" });
    expect(await db.appointment.count({ where: { createdByCallId: call.id } })).toBe(0);
  });
});
