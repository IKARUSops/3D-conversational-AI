import { describe, expect, it, vi } from "vitest";
import { createInitialAgentState, type AgentState, type TurnEvent, type TurnRequestParsed } from "@/contracts";
import { localClinicInfo, renderClinicFacts } from "@/lib/agent/clinic-knowledge";
import { mergeExtraction, stateDatetime, type LlmExtraction } from "@/lib/agent/postcall";
import { SseParser, encodeSse } from "@/lib/agent/sse";
import { applyPatientDetails, parseAgentState, summarizeState } from "@/lib/agent/state";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { bookingPrecheck, createAgentTools, type AgentServices, type ToolTracker } from "@/lib/agent/tools";
import { historyToMessages } from "@/lib/agent/turn";
import { CLINIC } from "./fixtures/clinic";

const N = (s: string) => s.normalize("NFC");
const NOW = new Date("2026-11-04T04:00:00Z"); // Wed 10:00 Dhaka

function fakeServices(overrides: Partial<AgentServices> = {}): AgentServices {
  return {
    checkAvailability: vi.fn(async () => ({
      slots: [
        { start: "2026-11-08T18:00:00+06:00", doctorId: "doc-nusrat", doctorNameBn: "ডা. নুসরাত জাহান", spokenBn: "রবিবার, আট নভেম্বর, সন্ধ্যা ছয়টা" },
      ],
    })),
    bookAppointment: vi.fn(async () => ({ ok: true as const, appointmentId: "appt-1", spokenSummaryBn: "বুক হয়েছে" })),
    findAppointments: vi.fn(async () => ({ appointments: [] })),
    rescheduleAppointment: vi.fn(async () => ({ ok: true as const, appointmentId: "appt-1", spokenSummaryBn: "" })),
    cancelAppointment: vi.fn(async () => ({ ok: true as const, appointmentId: "appt-1", spokenSummaryBn: "" })),
    getClinicInfo: vi.fn(async () => {
      throw new Error("not implemented");
    }),
    createCallback: vi.fn(async () => ({ ok: true as const, callbackId: "cb-1" })),
    logEvent: vi.fn(async () => undefined),
    ...overrides,
  };
}

function toolsFor(state: AgentState, svc = fakeServices()) {
  const holder = { state };
  const tracker: ToolTracker = { called: new Set(), pending: [] };
  const tools = createAgentTools(
    { callId: "call-1", clinicId: CLINIC.id, clinic: CLINIC, lang: "bn", now: () => NOW, holder, services: svc },
    tracker,
  );
  const run = async (name: string, input: unknown) =>
    (tools[name]!.execute as (i: unknown, o: unknown) => Promise<unknown>)(input, { toolCallId: "t", messages: [] });
  return { holder, tracker, run, svc };
}

const confirmedState = (): AgentState => ({
  ...createInitialAgentState(),
  patient: { nameBn: "শরীফ উদ্দিন", nameConfirmed: true },
  phone: { raw: "01712345678", e164: "+8801712345678", valid: true, confirmed: true, tries: 0 },
});

describe("T2.4 FR-C15 save_patient_details logic", () => {
  it("valid phone returns the Bangla read-back and is not yet confirmed", () => {
    const r = applyPatientDetails(createInitialAgentState(), { phoneRaw: "০১৭১২৩৪৫৬৭৮" });
    expect(r.output.phoneValid).toBe(true);
    expect(r.output.phoneSpoken).toBe(N("শূন্য, এক, সাত, এক, দুই, তিন, চার, পাঁচ, ছয়, সাত, আট"));
    expect(r.state.phone).toMatchObject({ raw: "01712345678", e164: "+8801712345678", confirmed: false });
  });
  it("counts failed tries and returns too_many_tries at 3", () => {
    let s = createInitialAgentState();
    for (let i = 0; i < 3; i++) s = applyPatientDetails(s, { phoneRaw: "01712" }).state;
    const r = applyPatientDetails(s, { phoneRaw: "0171" });
    expect(r.output.problems).toContain("too_many_tries");
    expect(r.state.phone?.tries).toBe(4);
  });
  it("a corrected number resets confirmation; confirming needs a valid number", () => {
    let s = applyPatientDetails(createInitialAgentState(), { phoneRaw: "01712345678", phoneConfirmed: true }).state;
    expect(s.phone?.confirmed).toBe(true);
    s = applyPatientDetails(s, { phoneRaw: "01812345678" }).state;
    expect(s.phone?.confirmed).toBe(false);
    s = applyPatientDetails(s, { phoneRaw: "123", phoneConfirmed: true }).state;
    expect(s.phone?.confirmed).toBe(false);
  });
  it("rejects names with digits and resets confirmation on a new name", () => {
    expect(applyPatientDetails(createInitialAgentState(), { nameBn: "শরীফ 123" }).output.problems).toEqual(["name_invalid"]);
    let s = applyPatientDetails(createInitialAgentState(), { nameBn: "শরীফ", nameConfirmed: true }).state;
    expect(s.patient?.nameConfirmed).toBe(true);
    s = applyPatientDetails(s, { nameBn: "শরীফ উদ্দিন" }).state;
    expect(s.patient?.nameConfirmed).toBe(false);
  });
});

describe("T2.4 FR-C18 tools with mocked services", () => {
  it("book_appointment refuses without confirmed name and phone and never calls the service", async () => {
    const t = toolsFor(createInitialAgentState());
    const out = await t.run("book_appointment", {
      slotStart: "2026-11-08T18:00:00+06:00",
      doctorId: "doc-nusrat",
      serviceCode: "checkup",
      reason: "দাঁত ব্যথা",
      callerConfirmed: true,
    });
    expect(out).toMatchObject({ ok: false, error: "missing_name" });
    expect(t.svc.bookAppointment).not.toHaveBeenCalled();
    expect(bookingPrecheck({ ...confirmedState(), phone: { ...confirmedState().phone!, confirmed: false } })).toMatchObject({
      error: "need_confirmation",
    });
  });
  it("book_appointment books when confirmed and stores the appointment id", async () => {
    const t = toolsFor(confirmedState());
    const out = await t.run("book_appointment", {
      slotStart: "2026-11-08T18:00:00+06:00",
      doctorId: "doc-nusrat",
      serviceCode: "checkup",
      reason: "দাঁত ব্যথা",
      callerConfirmed: true,
    });
    expect(out).toMatchObject({ ok: true, appointmentId: "appt-1" });
    expect(t.holder.state).toMatchObject({ appointmentId: "appt-1", intent: "book", chosenSlot: "2026-11-08T18:00:00+06:00" });
    await Promise.all(t.tracker.pending);
    expect(t.svc.logEvent).toHaveBeenCalledWith("call-1", "tool_call", expect.objectContaining({ name: "book_appointment" }));
    expect(t.svc.logEvent).toHaveBeenCalledWith("call-1", "tool_result", expect.objectContaining({ name: "book_appointment", ok: true }));
  });
  it("resolve_datetime and check_availability update the state", async () => {
    const t = toolsFor(createInitialAgentState());
    const r = await t.run("resolve_datetime", { phrase: "আগামী রবিবার সন্ধ্যায়" });
    expect(r).toMatchObject({ ok: true, isoDate: "2026-11-08" });
    expect(t.holder.state.requestedWindow).toMatchObject({ resolvedDate: "2026-11-08", partOfDay: "evening" });
    await t.run("check_availability", { isoDate: "2026-11-08", partOfDay: "evening", serviceCode: "checkup" });
    expect(t.holder.state).toMatchObject({ offeredSlots: ["2026-11-08T18:00:00+06:00"], doctorId: "doc-nusrat", intent: "book" });
  });
  it("FR-C12 flag_off_topic ends the call at the third turn", async () => {
    const t = toolsFor(createInitialAgentState());
    await t.run("flag_off_topic", { kind: "irrelevant" });
    await t.run("flag_off_topic", { kind: "prank" });
    expect(await t.run("flag_off_topic", { kind: "irrelevant" })).toEqual({ streak: 3, endCall: true });
  });
  it("get_clinic_info falls back to local facts when the service fails", async () => {
    const t = toolsFor(createInitialAgentState());
    const out = (await t.run("get_clinic_info", { topic: "payment" })) as { factsBn: string };
    expect(out.factsBn).toBe(N("ক্যাশ, বিকাশ, কার্ড"));
    expect(t.holder.state.intent).toBe("enquiry");
  });
  it("a throwing service returns a safe temporary_problem result", async () => {
    const t = toolsFor(confirmedState(), fakeServices({ createCallback: vi.fn(async () => { throw new Error("db down"); }) }));
    expect(await t.run("create_callback", { category: "billing", reason: "x", priority: "normal" })).toMatchObject({
      error: "temporary_problem",
    });
  });
  it("end_call stores the summary", async () => {
    const t = toolsFor(createInitialAgentState());
    await t.run("end_call", { reason: "done", summaryBn: "বুকিং হয়েছে" });
    expect(t.holder.state.ended).toEqual({ reason: "done", summaryBn: "বুকিং হয়েছে" });
  });
});

describe("T2.4 system prompt", () => {
  const prompt = buildSystemPrompt({ clinic: CLINIC, state: confirmedState(), now: NOW, lang: "bn" });
  it("has persona, Bangladeshi style rules and strict rules", () => {
    expect(prompt).toContain("You are Nadia (নাদিয়া)");
    expect(prompt).toContain("Never use: নমস্কার, জল");
    expect(prompt).toContain("callerConfirmed=true");
    expect(prompt).toContain("999");
  });
  it("injects clinic facts, today in Asia/Dhaka and the state", () => {
    expect(prompt).toContain("Dr. Nusrat Jahan");
    expect(prompt).toContain("Prayer break 13:30-14:30");
    expect(prompt).toContain(N("বুধবার, চার নভেম্বর (2026-11-04), time 10:00"));
    expect(prompt).toContain("Phone: 01712345678 (valid, confirmed)");
  });
  it("is NFC normalised", () => {
    expect(prompt).toBe(prompt.normalize("NFC"));
  });
  it("English mode switches language rules", () => {
    expect(buildSystemPrompt({ clinic: CLINIC, state: confirmedState(), now: NOW, lang: "en" })).toContain("The caller chose English");
  });
  it("clinic facts group doctor schedules", () => {
    expect(renderClinicFacts(CLINIC)).toContain("Sat, Mon, Wed 16:00-20:00");
    expect(localClinicInfo(CLINIC, "fees").factsBn).toContain(N("এক হাজার পাঁচশো টাকা"));
  });
  it("summarizeState says when nothing is known", () => {
    expect(summarizeState(createInitialAgentState())).toContain("Name: not given yet");
  });
  it("parseAgentState falls back to a fresh state", () => {
    expect(parseAgentState({ junk: 1, offTopicStreak: "x" })).toEqual(createInitialAgentState());
    expect(parseAgentState({ lastTurnSeq: 4 }).lastTurnSeq).toBe(4);
  });
});

describe("T2.4 SSE encoder and parser", () => {
  it("round-trips events split across chunks", () => {
    const events: TurnEvent[] = [
      { type: "sentence", seq: 0, text: "জি।", ttsText: "জি।" },
      { type: "done", turnId: "c:1", latency: { firstTokenMs: 420 } },
    ];
    const wire = events.map(encodeSse).join("");
    expect(wire.startsWith("data: {")).toBe(true);
    const p = new SseParser();
    const out = [...p.push(wire.slice(0, 17)), ...p.push(wire.slice(17))];
    expect(out).toEqual(events);
  });
});

describe("T2.4 history window", () => {
  it("maps speakers to roles and starts with a user message", () => {
    const msgs = historyToMessages([
      { speaker: "agent", text: "আসসালামু আলাইকুম" },
      { speaker: "caller", text: "appointment চাই" },
      { speaker: "system", text: "x" },
    ]);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });
});

describe("T2.4 post-call extraction merge", () => {
  const llm: LlmExtraction = {
    intent: "enquiry",
    patientNameBn: "শরিফ",
    patientNameEn: null,
    phoneRaw: "01700000000",
    reasonForVisit: "ব্যথা",
    serviceCode: "scaling",
    doctorRequested: null,
    preferredDatetimeText: "রবিবার",
    callerConfirmed: false,
    sentiment: "neutral",
    languageMix: "mixed",
    callbackCategory: null,
    summaryBn: "সারাংশ",
    summaryEn: "Summary",
    confidence: { intent: 0.6, patientName: 0.5, phone: 0.4, reasonForVisit: null, serviceCode: 0.7, preferredDatetime: null },
  };
  it("prefers tool-confirmed state over LLM guesses", () => {
    const state: AgentState = { ...confirmedState(), intent: "book", appointmentId: "a1", chosenSlot: "2026-11-08T18:00:00+06:00" };
    const m = mergeExtraction(llm, state, "google:x");
    expect(m).toMatchObject({
      intent: "book",
      patientNameBn: "শরীফ উদ্দিন",
      phoneRaw: "01712345678",
      preferredDatetime: "2026-11-08T18:00:00+06:00",
      callerConfirmed: true,
      model: "google:x",
    });
    expect(m.fieldConfidence.phone).toBe(1);
    expect(m.fieldConfidence.reasonForVisit).toBeUndefined();
  });
  it("uses the resolved window start when no slot was chosen", () => {
    expect(
      stateDatetime({ ...createInitialAgentState(), requestedWindow: { phrase: "x", resolvedDate: "2026-11-08", partOfDay: "evening" } }),
    ).toBe("2026-11-08T17:00:00+06:00");
  });
});

// Type check helper so TurnRequestParsed stays in sync with tests below.
export type _T = TurnRequestParsed;
