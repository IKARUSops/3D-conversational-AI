import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createInitialAgentState, type AgentState } from "@/contracts";
import type { CallExtraction } from "@/lib/agent/postcall";
import { buildExtractionRow, datetimeErrors } from "@/lib/services/extraction-row";
import { computeMetrics, percentile } from "@/lib/services/metrics";
import { checkBdPhone, isValidName } from "@/lib/services/validate";
import { clinicFixture, dhaka } from "../support/clinic-fixture";
import { testDb } from "../support/db-mock";
import { startTestDb, type TestDb } from "../support/pglite-db";
import { seedTestClinic, type SeededClinic } from "../support/seed-test";

vi.mock("@/lib/db", () => import("../support/db-mock"));
const { finalizeCall, sweepStaleCalls } = await import("@/lib/services/finalize");
const { bookAppointment } = await import("@/lib/services");

const clinic = clinicFixture();
const NOW = dhaka("2026-11-04T09:00");

describe("validation, FR-D-VAL (T1.6)", () => {
  it("phone: Bangla digits, +880, spaces and dashes become E.164", () => {
    expect(checkBdPhone("০১৭১২-৩৪৫ ৬৭৮")).toMatchObject({ valid: true, e164: "+8801712345678" });
    expect(checkBdPhone("+880 1812345678")).toMatchObject({ valid: true, e164: "+8801812345678" });
  });
  it("phone: wrong length, bad prefix, letters, empty", () => {
    expect(checkBdPhone("0171234567")).toMatchObject({ valid: false, problem: "too_short" });
    expect(checkBdPhone("017123456789")).toMatchObject({ valid: false, problem: "too_long" });
    expect(checkBdPhone("01212345678")).toMatchObject({ valid: false, problem: "bad_prefix" });
    expect(checkBdPhone("01712abc678")).toMatchObject({ valid: false, problem: "not_digits" });
    expect(checkBdPhone("")).toMatchObject({ valid: false, problem: "empty" });
  });
  it("name: Bangla, Latin with title, too short, digits (AT-17)", () => {
    expect(isValidName("Md. Nazmul Hasan Chowdhury")).toBe(true);
    expect(isValidName("তাসনিম আক্তার মিম")).toBe(true);
    expect(isValidName("মোঃ রহিম")).toBe(true);
    expect(isValidName("A")).toBe(false);
    expect(isValidName("Rahim 123")).toBe(false);
  });
  it("date rules: past, Friday, prayer break, outside hours, not aligned", () => {
    const codes = (local: string) => datetimeErrors(clinic, dhaka(local), NOW).map((e) => e.code);
    expect(codes("2026-11-08T18:00")).toEqual([]);
    expect(codes("2026-11-03T18:00")).toContain("datetime_in_past");
    expect(codes("2026-11-06T18:00")).toContain("datetime_closed_day");
    expect(codes("2026-11-08T14:00")).toContain("datetime_prayer_break");
    expect(codes("2026-11-08T20:00")).toContain("datetime_outside_hours");
    expect(codes("2026-11-08T18:10")).toContain("datetime_not_aligned");
  });
});

const extraction = (o: Partial<CallExtraction> = {}): CallExtraction => ({
  intent: "book",
  patientNameBn: "ভুল নাম",
  patientNameEn: "Wrong",
  phoneRaw: "01900000000",
  reasonForVisit: "toothache",
  serviceCode: "checkup",
  doctorRequested: null,
  preferredDatetimeText: "next sunday",
  preferredDatetime: "2026-11-08T18:00:00+06:00",
  callerConfirmed: true,
  sentiment: "positive",
  languageMix: "mixed",
  callbackCategory: null,
  summaryBn: "বুকিং হয়েছে",
  summaryEn: "Booked",
  fieldConfidence: { phone: 0.9 },
  model: "test-model",
  ...o,
});

describe("buildExtractionRow (T1.6)", () => {
  const state: AgentState = {
    ...createInitialAgentState(),
    intent: "book",
    patient: { nameBn: "শরীফ উদ্দিন", nameEn: "Sharif Uddin", nameConfirmed: true },
    phone: { raw: "০১৭১২৩৪৫৬৭৮", valid: true, confirmed: true, tries: 0 },
  };
  it("tool-confirmed state wins over the LLM", () => {
    const row = buildExtractionRow(extraction(), state, clinic, NOW);
    expect(row).toMatchObject({
      patientNameBn: "শরীফ উদ্দিন",
      phoneE164: "+8801712345678",
      phoneValid: true,
      summaryEn: "Booked",
    });
    expect(row.validationErrors).toEqual([]);
  });
  it("works without the LLM (null extraction)", () => {
    const row = buildExtractionRow(null, state, clinic, NOW);
    expect(row.intent).toBe("book");
    expect(row.phoneValid).toBe(true);
    expect(row.summaryEn).toBeNull();
  });
  it("records invalid phone and missing name for a booking intent", () => {
    const row = buildExtractionRow(
      extraction({ phoneRaw: "01712", patientNameBn: null, patientNameEn: null }),
      createInitialAgentState(),
      clinic,
      NOW,
    );
    expect(row.validationErrors.map((e) => e.code)).toEqual(["phone_invalid", "name_missing"]);
    expect(row.phoneValid).toBe(false);
  });
  it("enquiry without contact details has no missing errors", () => {
    const row = buildExtractionRow(
      extraction({
        intent: "enquiry",
        phoneRaw: null,
        patientNameBn: null,
        patientNameEn: null,
        preferredDatetime: null,
      }),
      createInitialAgentState(),
      clinic,
      NOW,
    );
    expect(row.validationErrors).toEqual([]);
  });
});

describe("metrics (T1.6, NFR-2)", () => {
  it("percentiles", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([300, 100, 200], 50)).toBe(200);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
  });
  it("counts latency, interruptions and fallbacks", () => {
    const m = computeMetrics(
      [
        { type: "turn_latency", payload: { firstTokenMs: 400, firstAudioMs: 1200 } },
        { type: "turn_latency", payload: { firstTokenMs: 600, firstAudioMs: 1400 } },
        { type: "interruption", payload: {} },
        { type: "provider_fallback", payload: { kind: "tts" } },
      ],
      { turns: 2, interruptedTurns: 0, silencePrompts: 1 },
    );
    expect(m).toMatchObject({
      turns: 2,
      interruptions: 1,
      providerFallbacks: 1,
      silencePrompts: 1,
    });
    expect(m.latencyMs.firstAudio.median).toBe(1200);
  });
});

describe("finalizeCall with PGlite (T1.6, SRS 2 section 9)", () => {
  let t: TestDb;
  let seeded: SeededClinic;
  const noSleep = { sleep: async () => {} };

  beforeAll(async () => {
    t = await startTestDb();
    testDb.prisma = t.prisma;
    seeded = await seedTestClinic(t.prisma);
  }, 60_000);
  afterAll(async () => {
    await t?.stop();
  });

  async function makeCall(
    state: AgentState,
    o: {
      endedAt?: Date | null;
      lastActivityAt?: Date;
      callerTurns?: number;
      endReason?: "agent_end" | "silence";
    } = {},
  ) {
    const call = await t.prisma.call.create({
      data: {
        clinicId: seeded.clinic.id,
        sttProvider: "browser",
        ttsProvider: "elevenlabs",
        agentState: state,
        startedAt: new Date(Date.now() - 120_000),
        endedAt: o.endedAt === undefined ? new Date() : o.endedAt,
        endReason: o.endedAt === null ? null : (o.endReason ?? "agent_end"),
        lastActivityAt: o.lastActivityAt ?? new Date(),
        recordingPath: "clinic/x/calls/y.webm",
      },
    });
    const n = o.callerTurns ?? 1;
    for (let i = 0; i < n * 2; i++) {
      await t.prisma.transcriptTurn.create({
        data: {
          callId: call.id,
          seq: i,
          speaker: i % 2 ? "caller" : "agent",
          textBn: i % 2 ? "আমি বুক করতে চাই" : "জি বলেন",
          startedMs: i * 1000,
        },
      });
    }
    return call.id;
  }

  it("booked call: extraction stored, batch transcript, translation, status booked, idempotent", async () => {
    const state: AgentState = {
      ...createInitialAgentState(),
      intent: "book",
      patient: { nameBn: "শরীফ উদ্দিন", nameEn: "Sharif Uddin", nameConfirmed: true },
      phone: { raw: "01712345678", valid: true, confirmed: true, tries: 0 },
    };
    const id = await makeCall(state);
    const r = await bookAppointment(
      { callId: id, clinicId: seeded.clinic.id, now: new Date(), state },
      {
        slotStart: "2030-11-10T18:00:00+06:00",
        doctorId: seeded.doctorIds["nusrat-jahan"]!,
        serviceCode: "checkup",
        reason: "x",
        callerConfirmed: true,
      },
    );
    expect(r.ok).toBe(true);
    const deps = {
      ...noSleep,
      downloadRecording: async () => new ArrayBuffer(8),
      transcribe: async () => ({
        provider: "elevenlabs" as const,
        text: "আমি বুক করতে চাই",
        segments: [{ startMs: 0, endMs: 900, text: "আমি বুক করতে চাই" }],
      }),
      extract: async () => extraction(),
      translate: async (texts: string[]) => texts.map(() => "en"),
    };
    const res = await finalizeCall(id, { deps });
    expect(res).toEqual({ state: "done", status: "booked" });
    const call = await t.prisma.call.findUniqueOrThrow({
      where: { id },
      include: { extraction: true, turns: true },
    });
    expect(call.processingState).toBe("done");
    expect(call.summaryEn).toBe("Booked");
    expect(call.durationS).toBeGreaterThanOrEqual(119);
    expect(call.extraction?.phoneE164).toBe("+8801712345678");
    expect(call.turns.filter((x) => x.source === "batch")).toHaveLength(1);
    expect(call.turns.filter((x) => x.source === "live").every((x) => x.textEn === "en")).toBe(
      true,
    );
    expect(call.metrics).toMatchObject({ turns: 1 });
    expect(await finalizeCall(id, { deps })).toEqual({ state: "skipped" });
    const types = (await t.prisma.callEvent.findMany({ where: { callId: id } })).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["finalize_started", "finalize_done"]));
  });

  it("AI failures do not block: extraction throws, transcribe null -> still done, links patient", async () => {
    const state: AgentState = {
      ...createInitialAgentState(),
      phone: { raw: "01812345678", valid: true, confirmed: true, tries: 0 },
    };
    const id = await makeCall(state);
    await t.prisma.callEvent.create({
      data: {
        callId: id,
        type: "tool_call",
        payload: { name: "get_clinic_info", input: { topic: "hours" } },
      },
    });
    const res = await finalizeCall(id, {
      deps: {
        ...noSleep,
        downloadRecording: async () => null,
        transcribe: async () => null,
        extract: async () => {
          throw new Error("all LLMs down");
        },
        translate: async () => null,
      },
    });
    expect(res).toEqual({ state: "done", status: "enquiry" });
    const call = await t.prisma.call.findUniqueOrThrow({ where: { id } });
    expect(call.patientId).not.toBeNull();
    expect(await t.prisma.callEvent.count({ where: { callId: id, type: "llm_error" } })).toBe(1);
  });

  it("callback in the call -> follow_up_needed (AT-6)", async () => {
    const id = await makeCall(createInitialAgentState());
    await t.prisma.callback.create({
      data: { clinicId: seeded.clinic.id, callId: id, category: "medical", reason: "ওষুধ" },
    });
    const res = await finalizeCall(id, {
      deps: {
        ...noSleep,
        extract: async () => extraction({ intent: "callback" }),
        downloadRecording: async () => null,
      },
    });
    expect(res).toMatchObject({ status: "follow_up_needed" });
  });

  it("silence with no caller speech -> incomplete (AT-9)", async () => {
    const id = await makeCall(createInitialAgentState(), { callerTurns: 0, endReason: "silence" });
    expect(
      await finalizeCall(id, { deps: { ...noSleep, downloadRecording: async () => null } }),
    ).toMatchObject({ status: "incomplete" });
  });

  it("stale sweep finalizes a call with no activity for 3 minutes as tab_closed (AT-24)", async () => {
    const old = new Date(Date.now() - 10 * 60_000);
    const id = await makeCall(createInitialAgentState(), { endedAt: null, lastActivityAt: old });
    const fresh = await makeCall(createInitialAgentState(), { endedAt: null });
    const n = await sweepStaleCalls({
      deps: {
        ...noSleep,
        downloadRecording: async () => null,
        extract: async () => extraction({ intent: "unknown" }),
      },
    });
    expect(n).toBe(1);
    const call = await t.prisma.call.findUniqueOrThrow({ where: { id } });
    expect(call).toMatchObject({
      endReason: "tab_closed",
      processingState: "done",
      status: "incomplete",
    });
    expect(call.endedAt?.getTime()).toBe(old.getTime());
    expect((await t.prisma.call.findUniqueOrThrow({ where: { id: fresh } })).processingState).toBe(
      "pending",
    );
  });

  it("DB errors retry 3 times then mark failed (NFR-4)", async () => {
    const id = await makeCall(createInitialAgentState());
    let calls = 0;
    const sleeps: number[] = [];
    const res = await finalizeCall(id, {
      deps: {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        downloadRecording: async () => null,
        // Throwing from `now` makes the whole run fail like a DB error would.
        now: () => {
          calls++;
          if (calls <= 4) throw new Error("db down");
          return new Date();
        },
      },
    });
    expect(sleeps).toEqual([2000, 8000, 20000]);
    expect(res).toMatchObject({ state: "failed", status: "incomplete" });
    expect((await t.prisma.call.findUniqueOrThrow({ where: { id } })).processingState).toBe(
      "failed",
    );
  });
});
