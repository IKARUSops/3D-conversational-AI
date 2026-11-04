import { describe, expect, it } from "vitest";
import { buildTranscriptItems, markerLabel, type TurnLike } from "./transcript";

const start = new Date("2026-11-04T10:00:00Z");
const turn = (seq: number, ms: number, speaker: TurnLike["speaker"] = "agent"): TurnLike => ({
  id: `t${seq}`,
  seq,
  speaker,
  textBn: `turn ${seq}`,
  textEn: null,
  startedMs: ms,
  interrupted: false,
  inputMode: null,
});

describe("FR-D6 transcript with tool markers", () => {
  it("places tool calls between turns by time", () => {
    const items = buildTranscriptItems(
      [turn(0, 0), turn(1, 4000, "caller"), turn(2, 9000)],
      [
        {
          id: "e1",
          ts: new Date(start.getTime() + 6000),
          type: "tool_call",
          payload: { name: "check_availability" },
        },
        {
          id: "e2",
          ts: new Date(start.getTime() + 6500),
          type: "tool_result",
          payload: { name: "check_availability", ok: true },
        },
        { id: "e3", ts: new Date(start.getTime() + 1000), type: "turn_latency", payload: {} },
      ],
      start,
    );
    expect(items.map((i) => (i.kind === "turn" ? i.turn.id : i.id))).toEqual([
      "t0",
      "t1",
      "e1",
      "t2",
    ]);
  });

  it("labels markers in plain words", () => {
    expect(markerLabel("tool_call", { name: "book_appointment" }).label).toBe(
      "Tool: book appointment",
    );
    expect(markerLabel("tool_result", { name: "book_appointment", ok: false })).toEqual({
      label: "Result: book appointment (failed)",
      ok: false,
    });
    expect(markerLabel("interruption", {}).label).toBe("Caller interrupted");
  });
});
