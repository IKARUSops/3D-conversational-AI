import { describe, expect, it } from "vitest";
import {
  AgentStateSchema,
  BookAppointmentInputSchema,
  CallStatus,
  StartCallRequestSchema,
  TOOL_SCHEMAS,
  ToolName,
  TurnEventSchema,
  TurnRequestSchema,
  createInitialAgentState,
} from "@/contracts";

describe("contracts (T0.2)", () => {
  it("has all 9 call statuses", () => {
    expect(CallStatus).toHaveLength(9);
  });

  it("start call request fills defaults", () => {
    const parsed = StartCallRequestSchema.parse({
      sttProvider: "browser",
      ttsProvider: "elevenlabs",
    });
    expect(parsed.clinicSlug).toBe("dhaka-dental-care");
    expect(parsed.lang).toBe("bn");
  });

  it("turn request needs text unless an event is sent", () => {
    const base = { turnSeq: 1, inputMode: "voice", sttProvider: "browser", clientTs: 1 } as const;
    expect(TurnRequestSchema.safeParse({ ...base, text: "  " }).success).toBe(false);
    expect(TurnRequestSchema.safeParse({ ...base, event: "silence" }).success).toBe(true);
    expect(TurnRequestSchema.safeParse({ ...base, text: "আমি appointment চাই" }).success).toBe(
      true,
    );
  });

  it("turn events are a discriminated union", () => {
    expect(
      TurnEventSchema.parse({ type: "sentence", seq: 0, text: "জি", ttsText: "জি" }).type,
    ).toBe("sentence");
    expect(TurnEventSchema.safeParse({ type: "nope" }).success).toBe(false);
  });

  it("FR-C18: booking input requires callerConfirmed === true", () => {
    const input = {
      slotStart: "2026-11-08T18:00:00+06:00",
      doctorId: "d1",
      serviceCode: "checkup",
      reason: "দাঁত ব্যথা",
    };
    expect(BookAppointmentInputSchema.safeParse({ ...input, callerConfirmed: false }).success).toBe(
      false,
    );
    expect(BookAppointmentInputSchema.safeParse({ ...input, callerConfirmed: true }).success).toBe(
      true,
    );
  });

  it("every tool has input and output schemas", () => {
    expect(Object.keys(TOOL_SCHEMAS).sort()).toEqual([...ToolName].sort());
  });

  it("initial agent state is valid", () => {
    expect(AgentStateSchema.parse(createInitialAgentState("bn"))).toMatchObject({
      offTopicStreak: 0,
    });
  });
});
