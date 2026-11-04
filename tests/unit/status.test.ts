import { describe, expect, it } from "vitest";
import { createInitialAgentState, StatusFactsSchema, type StatusFacts } from "@/contracts";
import { computeCallStatus, statusFactsFrom, type StatusSources } from "@/lib/services/status";

const base: StatusFacts = {
  appointmentActions: [],
  callbacksCreated: 0,
  offTopicStreakMax: 0,
  abuse: false,
  infoGiven: false,
  callerSpoke: true,
  endReason: "agent_end",
  technicalFailure: false,
};
const f = (o: Partial<StatusFacts>): StatusFacts => ({ ...base, ...o });
const at = (m: number) => new Date(Date.UTC(2026, 10, 4, 10, m)).toISOString();

describe("status rules, SRS 1 section 4.5.1 (T1.6, FR-D14)", () => {
  it("booked: an appointment was created (AT-1)", () => {
    expect(computeCallStatus(f({ appointmentActions: [{ action: "created", at: at(1) }] }))).toBe(
      "booked",
    );
  });
  it("rescheduled: an appointment was moved (AT-3)", () => {
    expect(
      computeCallStatus(f({ appointmentActions: [{ action: "rescheduled", at: at(1) }] })),
    ).toBe("rescheduled");
  });
  it("cancelled: an appointment was cancelled (AT-4)", () => {
    expect(computeCallStatus(f({ appointmentActions: [{ action: "cancelled", at: at(1) }] }))).toBe(
      "cancelled",
    );
  });
  it("latest appointment action wins", () => {
    const actions = [
      { action: "cancelled" as const, at: at(5) },
      { action: "created" as const, at: at(2) },
    ];
    expect(computeCallStatus(f({ appointmentActions: actions }))).toBe("cancelled");
    expect(
      computeCallStatus(
        f({
          appointmentActions: [
            { action: "created", at: at(1) },
            { action: "rescheduled", at: at(1) },
          ],
        }),
      ),
    ).toBe("rescheduled");
  });
  it("appointment action beats callback, spam and enquiry", () => {
    expect(
      computeCallStatus(
        f({
          appointmentActions: [{ action: "created", at: at(1) }],
          callbacksCreated: 1,
          offTopicStreakMax: 3,
          infoGiven: true,
        }),
      ),
    ).toBe("booked");
  });
  it("follow_up_needed: a callback was created (AT-6, AT-7)", () => {
    expect(computeCallStatus(f({ callbacksCreated: 1, infoGiven: true }))).toBe("follow_up_needed");
  });
  it("follow_up_needed beats spam", () => {
    expect(computeCallStatus(f({ callbacksCreated: 1, abuse: true }))).toBe("follow_up_needed");
  });
  it("spam: 3 off-topic turns in a row (AT-8)", () => {
    expect(computeCallStatus(f({ offTopicStreakMax: 3, infoGiven: true }))).toBe("spam");
  });
  it("spam: abuse", () => {
    expect(computeCallStatus(f({ abuse: true }))).toBe("spam");
  });
  it("two off-topic turns are not spam", () => {
    expect(computeCallStatus(f({ offTopicStreakMax: 2 }))).toBe("incomplete");
  });
  it("enquiry: only information was given (AT-5)", () => {
    expect(computeCallStatus(f({ infoGiven: true }))).toBe("enquiry");
  });
  it("incomplete: silence timeout with nothing done (AT-9)", () => {
    expect(computeCallStatus(f({ callerSpoke: false, endReason: "silence" }))).toBe("incomplete");
  });
  it("incomplete: hang-up, time limit and closed tab (AT-24)", () => {
    for (const endReason of ["caller_hangup", "time_limit", "tab_closed"] as const) {
      expect(computeCallStatus(f({ endReason }))).toBe("incomplete");
    }
  });
  it("failed: technical failure with nothing useful saved", () => {
    expect(computeCallStatus(f({ endReason: "error", technicalFailure: true }))).toBe("failed");
  });
  it("technical failure after a booking is still booked", () => {
    expect(
      computeCallStatus(
        f({
          technicalFailure: true,
          endReason: "error",
          appointmentActions: [{ action: "created", at: at(1) }],
        }),
      ),
    ).toBe("booked");
  });
  it("technical failure after an answer is enquiry (failed only when nothing useful)", () => {
    expect(
      computeCallStatus(f({ technicalFailure: true, endReason: "error", infoGiven: true })),
    ).toBe("enquiry");
  });
});

describe("statusFactsFrom (T1.6)", () => {
  const src = (o: Partial<StatusSources>): StatusSources => ({
    history: [],
    callbacksCreated: 0,
    events: [],
    agentState: createInitialAgentState(),
    callerTurns: 2,
    endReason: "agent_end",
    ...o,
  });

  it("produces facts that match the contract schema", () => {
    const facts = statusFactsFrom(src({ history: [{ action: "created", at: new Date() }] }));
    expect(StatusFactsSchema.safeParse(facts).success).toBe(true);
  });
  it("reads the max off-topic streak from flag_off_topic results", () => {
    const events = [1, 2, 3].map((streak) => ({
      type: "tool_result",
      payload: { name: "flag_off_topic", output: { streak, endCall: streak >= 3 } },
    }));
    expect(computeCallStatus(statusFactsFrom(src({ events })))).toBe("spam");
  });
  it("abuse flag from flag_off_topic input", () => {
    const events = [
      { type: "tool_call", payload: { name: "flag_off_topic", input: { kind: "abuse" } } },
    ];
    expect(statusFactsFrom(src({ events })).abuse).toBe(true);
  });
  it("info tools mean enquiry", () => {
    const events = [
      { type: "tool_call", payload: { name: "get_clinic_info", input: { topic: "hours" } } },
    ];
    expect(computeCallStatus(statusFactsFrom(src({ events })))).toBe("enquiry");
  });
  it("enquiry intent counts only when the caller spoke", () => {
    const st = { ...createInitialAgentState(), intent: "enquiry" as const };
    expect(computeCallStatus(statusFactsFrom(src({ agentState: st })))).toBe("enquiry");
    expect(
      computeCallStatus(
        statusFactsFrom(src({ agentState: st, callerTurns: 0, endReason: "silence" })),
      ),
    ).toBe("incomplete");
  });
  it("end reason error is a technical failure", () => {
    expect(computeCallStatus(statusFactsFrom(src({ endReason: "error", callerTurns: 0 })))).toBe(
      "failed",
    );
  });
});
