import { describe, expect, it } from "vitest";
import { StateGate } from "./shared";

describe("FR-A4 mascot state gate (SRS 3 section 4)", () => {
  it("keeps each state at least 400 ms", () => {
    const g = new StateGate("idle", 0);
    expect(g.update("speaking", 100)).toBe("idle");
    expect(g.update("speaking", 400)).toBe("speaking");
    expect(g.update("listening", 500)).toBe("speaking");
    expect(g.update("listening", 800)).toBe("listening");
  });

  it("shows thinking only after a 300 ms wait", () => {
    const g = new StateGate("listening", 0);
    expect(g.update("thinking", 1000)).toBe("listening");
    expect(g.update("thinking", 1200)).toBe("listening");
    expect(g.update("thinking", 1301)).toBe("thinking");
  });

  it("skips a short thinking blip", () => {
    const g = new StateGate("listening", 0);
    g.update("thinking", 1000);
    expect(g.update("speaking", 1100)).toBe("speaking");
  });
});
