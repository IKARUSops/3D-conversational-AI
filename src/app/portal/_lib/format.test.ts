import { describe, expect, it } from "vitest";
import {
  buildCallsWhere,
  dhakaDayStart,
  formatDuration,
  maskPhone,
  mmss,
  normalizeSearch,
  withParams,
} from "./format";

describe("portal format helpers (FR-D2, FR-D3, FR-D6)", () => {
  it("FR-D2 masks the phone except the last 4 digits", () => {
    expect(maskPhone("+8801712345678")).toBe("+880 ••••••5678");
    expect(maskPhone("01712345678")).toBe("••••••5678");
    expect(maskPhone(null)).toBe("Not given");
  });

  it("formats durations and transcript timestamps", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(95)).toBe("1:35");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(mmss(65_400)).toBe("01:05");
    expect(mmss(null)).toBe("--:--");
  });

  it("converts Bangla digits in search", () => {
    expect(normalizeSearch(" ০১৭১২ ")).toBe("01712");
  });

  it("uses Dhaka day boundaries (UTC+6)", () => {
    expect(dhakaDayStart("2026-11-05").toISOString()).toBe("2026-11-04T18:00:00.000Z");
  });

  it("FR-D3 builds a where clause with filters and phone search", () => {
    const where = buildCallsWhere("c1", {
      q: "০১৭১২",
      status: "booked",
      stt: "browser",
      from: "2026-11-01",
      to: "2026-11-02",
      page: 1,
    }) as { AND: Record<string, unknown>[] };
    expect(where.AND[0]).toEqual({ clinicId: "c1" });
    expect(where.AND).toContainEqual({ status: "booked" });
    expect(where.AND).toContainEqual({ sttProvider: "browser" });
    const range = where.AND.find((c) => "startedAt" in c) as { startedAt: { gte: Date; lt: Date } };
    expect(range.startedAt.lt.toISOString()).toBe("2026-11-02T18:00:00.000Z");
    const or = (where.AND.at(-1) as { OR: unknown[] }).OR;
    expect(or).toContainEqual({ patient: { phoneE164: { contains: "1712" } } });
  });

  it("keeps other params when changing the page", () => {
    expect(withParams({ status: "booked", page: "2" }, { page: 3 })).toBe("?status=booked&page=3");
    expect(withParams({ status: "booked" }, { status: null })).toBe("");
  });
});
