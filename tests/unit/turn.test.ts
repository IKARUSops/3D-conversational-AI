import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { TurnRequestSchema, createInitialAgentState, type AgentState, type TurnEvent } from "@/contracts";
import type { CallRow, NewTurn, TurnStore } from "@/lib/agent/store";
import type { AgentServices } from "@/lib/agent/tools";
import { prepareTurn, runTurn, type TurnDeps } from "@/lib/agent/turn";
import type { LlmHandle } from "@/lib/providers/llm/types";
import { CLINIC } from "./fixtures/clinic";

const N = (s: string) => s.normalize("NFC");
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};
const finish = (unified: "stop" | "tool-calls" = "stop") => ({ type: "finish" as const, usage, finishReason: { unified, raw: unified } });

type V4Part = Parameters<typeof simulateReadableStream>[0]["chunks"][number];

function textModel(texts: string[], delayMs = 0) {
  const chunks = [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t" },
    ...texts.map((delta) => ({ type: "text-delta", id: "t", delta })),
    { type: "text-end", id: "t" },
    finish(),
  ] as V4Part[];
  return new MockLanguageModelV4({
    doStream: async () => ({ stream: simulateReadableStream({ chunks, initialDelayInMs: delayMs, chunkDelayInMs: 0 }) as never }),
  });
}

/** Step 1: text + end_call tool call; step 2 (if reached): nothing. */
function endCallModel() {
  let step = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      step++;
      const chunks = (
        step === 1
          ? [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "t" },
              { type: "text-delta", id: "t", delta: "ঠিক আছে, রবিবার দেখা হবে। আল্লাহ হাফেজ।" },
              { type: "text-end", id: "t" },
              { type: "tool-call", toolCallId: "c1", toolName: "end_call", input: JSON.stringify({ reason: "done", summaryBn: "বুকিং হয়েছে" }) },
              finish("tool-calls"),
            ]
          : [{ type: "stream-start", warnings: [] }, finish()]
      ) as V4Part[];
      return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 0 }) as never };
    },
  });
}

const llm = (id: string, model: MockLanguageModelV4): LlmHandle => ({ id, vendor: "google", model, providerOptions: {} });

function memoryStore(state: AgentState = createInitialAgentState()) {
  const call: CallRow = {
    id: "call-1",
    clinicId: CLINIC.id,
    startedAt: new Date(Date.now() - 10_000),
    endedAt: null,
    lang: "bn",
    agentState: state,
  };
  const turns: Array<NewTurn & { interrupted?: boolean }> = [
    { speaker: "agent", text: "আসসালামু আলাইকুম, বলেন কীভাবে সাহায্য করতে পারি?", startedMs: 0 },
  ];
  const store: TurnStore = {
    loadCall: async () => call,
    loadHistory: async (_id, limit) => turns.slice(-limit).map((t) => ({ speaker: t.speaker, text: t.text })),
    saveTurn: async (_id, t) => void turns.push(t),
    recordInterruption: async (_id, prefix, startedMs) => {
      const last = turns.at(-1);
      if (last?.speaker === "agent") Object.assign(last, { text: prefix || "…", interrupted: true });
      else if (prefix) turns.push({ speaker: "agent", text: prefix, startedMs, interrupted: true });
    },
    saveState: async (_id, s) => {
      call.agentState = s;
    },
  };
  return { store, call, turns };
}

function services(): AgentServices {
  return {
    checkAvailability: vi.fn(),
    bookAppointment: vi.fn(),
    findAppointments: vi.fn(),
    rescheduleAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
    getClinicInfo: vi.fn(),
    createCallback: vi.fn(),
    logEvent: vi.fn(async () => undefined),
  } as unknown as AgentServices;
}

async function turn(body: Record<string, unknown>, deps: Partial<TurnDeps> & { llms: LlmHandle[] }, mem = memoryStore()) {
  const parsed = TurnRequestSchema.parse({ inputMode: "voice", sttProvider: "browser", clientTs: 1, ...body });
  const prep = await prepareTurn("call-1", CLINIC.id, parsed, mem.store);
  if (!prep.ok) throw new Error(prep.code);
  const events: TurnEvent[] = [];
  const svc = deps.services ?? services();
  await runTurn(
    { callId: "call-1", clinicId: CLINIC.id, call: prep.call, state: prep.state, body: parsed, signal: new AbortController().signal },
    { store: mem.store, loadClinic: async () => CLINIC, services: svc, ...deps },
    (e) => events.push(e),
  );
  return { events, mem, svc };
}

/** Step 1: one tool call, no text; later steps: nothing (like the step limit in TC-03). */
function toolOnlyModel(toolName: string, input: unknown) {
  let step = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      step++;
      const chunks = (
        step === 1
          ? [
              { type: "stream-start", warnings: [] },
              { type: "tool-call", toolCallId: "b1", toolName, input: JSON.stringify(input) },
              finish("tool-calls"),
            ]
          : [{ type: "stream-start", warnings: [] }, finish()]
      ) as V4Part[];
      return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 0 }) as never };
    },
  });
}

describe("T2.4 turn loop (mock LLM)", () => {
  it("streams sentences with speakable ttsText, saves turns and ends with done", async () => {
    const { events, mem } = await turn(
      { turnSeq: 1, text: "আমি appointment নিতে চাই" },
      { llms: [llm("google:mock", textModel(["জি, অবশ্যই। আপনার ", "মোবাইল 01712345678 ঠিক আছে?"]))] },
    );
    const sentences = events.filter((e) => e.type === "sentence");
    expect(sentences.map((s) => s.text)).toEqual([N("জি, অবশ্যই।"), N("আপনার মোবাইল 01712345678 ঠিক আছে?")]);
    expect(sentences[1]!.ttsText).toContain(N("শূন্য, এক, সাত"));
    expect(sentences.map((s) => s.seq)).toEqual([0, 1]);
    expect(events.at(-1)).toMatchObject({ type: "done", turnId: "call-1:1" });
    expect(mem.turns.map((t) => t.speaker)).toEqual(["agent", "caller", "agent"]);
    expect((mem.call.agentState as AgentState).nextAgentSeq).toBe(2);
  });

  it("emits end_call when the model calls the end_call tool", async () => {
    const { events, mem } = await turn({ turnSeq: 1, text: "না, ধন্যবাদ" }, { llms: [llm("google:mock", endCallModel())] });
    expect(events.find((e) => e.type === "end_call")).toEqual({ type: "end_call", reason: "done", summary: "বুকিং হয়েছে" });
    expect(events.findIndex((e) => e.type === "end_call")).toBeLessThan(events.findIndex((e) => e.type === "done"));
    expect((mem.call.agentState as AgentState).ended?.summaryBn).toBe("বুকিং হয়েছে");
  });

  it("FR-C14 falls back to the second LLM when the first gives no token in time", async () => {
    const { events, svc } = await turn(
      { turnSeq: 1, text: "হ্যালো" },
      {
        llms: [llm("google:slow", textModel(["late."], 500)), llm("openai:fast", textModel(["জি, বলেন।"]))],
        firstTokenTimeoutMs: 50,
      },
    );
    expect(events.filter((e) => e.type === "sentence").map((e) => e.type === "sentence" && e.text)).toEqual([N("জি, বলেন।")]);
    expect(svc.logEvent).toHaveBeenCalledWith("call-1", "provider_fallback", expect.objectContaining({ kind: "llm", from: "google:slow", to: "openai:fast" }));
  });

  it("FR-C16 silence events use fixed lines without the LLM and end at the third", async () => {
    const model = textModel(["unused"]);
    const mem = memoryStore();
    const deps = { llms: [llm("google:mock", model)] };
    await turn({ turnSeq: 1, event: "silence" }, deps, mem);
    await turn({ turnSeq: 2, event: "silence" }, deps, mem);
    const third = await turn({ turnSeq: 3, event: "silence" }, deps, mem);
    expect(third.events.some((e) => e.type === "end_call")).toBe(true);
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it("FR-C17 barge-in after an aborted reply saves the spoken prefix as an agent turn", async () => {
    const mem = memoryStore();
    mem.turns.push({ speaker: "caller", text: "appointment চাই", startedMs: 1 });
    await turn(
      { turnSeq: 1, text: "না না, শোনেন", interruptedAgentSeq: 0, spokenPrefix: "জি, অবশ্যই।" },
      { llms: [llm("google:mock", textModel(["জি, বলেন।"]))] },
      mem,
    );
    expect(mem.turns.map((t) => [t.speaker, t.text])).toEqual([
      ["agent", "আসসালামু আলাইকুম, বলেন কীভাবে সাহায্য করতে পারি?"],
      ["caller", "appointment চাই"],
      ["agent", "জি, অবশ্যই।"],
      ["caller", "না না, শোনেন"],
      ["agent", N("জি, বলেন।")],
    ]);
  });

  it("FR-C17 barge-in trims the last agent turn to the spoken prefix", async () => {
    const mem = memoryStore();
    await turn(
      { turnSeq: 1, text: "একটু থামেন", interruptedAgentSeq: 0, spokenPrefix: "আসসালামু আলাইকুম" },
      { llms: [llm("google:mock", textModel(["জি, বলেন।"]))] },
      mem,
    );
    expect(mem.turns[0]).toMatchObject({ text: "আসসালামু আলাইকুম", interrupted: true });
  });

  it("says sorry when every LLM fails", async () => {
    const broken = new MockLanguageModelV4({ doStream: async () => { throw new Error("quota"); } });
    const { events } = await turn({ turnSeq: 1, text: "হ্যালো" }, { llms: [llm("google:x", broken)] });
    const s = events.find((e) => e.type === "sentence");
    expect(s && s.type === "sentence" && s.text).toContain(N("দুঃখিত"));
    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("rejects stale and ended turns in prepareTurn", async () => {
    const mem = memoryStore({ ...createInitialAgentState(), lastTurnSeq: 5 });
    const body = TurnRequestSchema.parse({ turnSeq: 5, text: "x", inputMode: "voice", sttProvider: "browser", clientTs: 1 });
    expect(await prepareTurn("call-1", CLINIC.id, body, mem.store)).toMatchObject({ ok: false, code: "stale_turn" });
    mem.call.endedAt = new Date();
    expect(await prepareTurn("call-1", CLINIC.id, { ...body, turnSeq: 6 }, mem.store)).toMatchObject({ ok: false, code: "call_ended" });
    expect(await prepareTurn("call-1", "other-clinic", { ...body, turnSeq: 6 }, mem.store)).toMatchObject({ ok: false });
  });

  it("TC-03: yes to the full read-back confirms name and phone, books, and speaks the result", async () => {
    const state: AgentState = {
      ...createInitialAgentState(),
      patient: { nameBn: "শরীফ", nameConfirmed: false },
      phone: { raw: "01867643866", e164: "+8801867643866", valid: true, confirmed: false, tries: 0 },
    };
    const svc = services();
    const summary = N("অ্যাপয়েন্টমেন্ট বুক হয়েছে: বৃহস্পতিবার, পাঁচ নভেম্বর, বিকেল সাড়ে তিনটা, ডা. ফারহানা ইসলাম।");
    (svc.bookAppointment as ReturnType<typeof vi.fn>).mockImplementation(async (ctx: { state: AgentState }) => {
      expect(ctx.state.patient?.nameConfirmed).toBe(true);
      expect(ctx.state.phone?.confirmed).toBe(true);
      return { ok: true, appointmentId: "appt-1", spokenSummaryBn: summary };
    });
    const model = toolOnlyModel("book_appointment", {
      slotStart: "2026-11-05T15:30:00+06:00",
      doctorId: "doc-nusrat",
      serviceCode: "checkup",
      reason: "দাঁতে ব্যথা",
      callerConfirmed: true,
    });
    const mem0 = memoryStore(state);
    mem0.turns.push({ speaker: "agent", text: N("শরীফ, শেষ চার ৩৮৬৬, চেক-আপ, বিকেল সাড়ে তিনটা, ঠিক আছে?"), startedMs: 1 });
    const { events, mem } = await turn(
      { turnSeq: 1, text: "হ্যাঁ ঠিক আছে" },
      { llms: [llm("google:mock", model)], services: svc },
      mem0,
    );
    expect(svc.bookAppointment).toHaveBeenCalledTimes(1);
    const said = events.filter((e) => e.type === "sentence").map((e) => e.text).join(" ");
    expect(said).toContain(N("বুক হয়েছে"));
    expect(said).not.toContain(N("আবার বলবেন"));
    expect((mem.call.agentState as AgentState).appointmentId).toBe("appt-1");
  });

  it("TC-05: one question per reply, everything after the first question is dropped", async () => {
    const { events, mem } = await turn(
      { turnSeq: 1, text: "০১৮৬৭৬৪৩৮৬৬" },
      {
        llms: [
          llm(
            "google:mock",
            textModel(["আপনার নম্বর শূন্য এক আট, ঠিক আছে? এখন বলেন, কী সমস্যার জন্য আসতে চান? ", "দাঁতের ব্যথা নাকি স্কেলিং?"]),
          ),
        ],
      },
    );
    const said = events.filter((e) => e.type === "sentence").map((e) => e.text);
    expect(said.join(" ")).toContain(N("ঠিক আছে?"));
    expect(said.join(" ")).not.toContain(N("সমস্যার"));
    expect(said.join(" ")).not.toContain(N("স্কেলিং"));
    expect(mem.turns.at(-1)?.text).not.toContain(N("সমস্যার"));
  });

  it("TC-08: booking right after a slot offer (no read-back) is refused", async () => {
    const state: AgentState = {
      ...createInitialAgentState(),
      patient: { nameBn: "রফিকুল", nameConfirmed: true },
      phone: { raw: "01712345601", e164: "+8801712345601", valid: true, confirmed: true, tries: 0 },
    };
    const svc = services();
    const mem0 = memoryStore(state);
    mem0.turns.push({ speaker: "agent", text: N("শনিবার সকাল দশটা বা এগারোটা খালি আছে। কোন সময়ে আসতে চান?"), startedMs: 1 });
    const model = toolOnlyModel("book_appointment", {
      slotStart: "2026-11-07T10:00:00+06:00",
      doctorId: "doc-nusrat",
      serviceCode: "scaling",
      reason: "স্কেলিং",
      callerConfirmed: true,
    });
    await turn({ turnSeq: 1, text: "প্রথম টাইমটা দেন" }, { llms: [llm("google:mock", model)], services: svc }, mem0);
    expect(svc.bookAppointment).not.toHaveBeenCalled();
  });

  it("TC-10: a goodbye without end_call still ends the call", async () => {
    const { events, mem } = await turn(
      { turnSeq: 1, text: "ঠিক আছে ধন্যবাদ" },
      { llms: [llm("google:mock", textModel(["ভালো থাকবেন, আল্লাহ হাফেজ। কল করার জন্য ধন্যবাদ।"]))] },
    );
    expect(events.find((e) => e.type === "end_call")).toBeTruthy();
    expect((mem.call.agentState as AgentState).ended?.reason).toBe("goodbye");
  });

  it("a goodbye inside a question does not end the call", async () => {
    const { events } = await turn(
      { turnSeq: 1, text: "আচ্ছা" },
      { llms: [llm("google:mock", textModel(["আর কিছু জানতে চান?"]))] },
    );
    expect(events.find((e) => e.type === "end_call")).toBeUndefined();
  });
});
