import { describe, expect, it } from "vitest";
import {
  computeSlots,
  doctorGroups,
  isValidSlot,
  matchDoctor,
  type BusySlot,
} from "@/lib/services/availability";
import { spokenDateTimeBn, spokenTimeBn } from "@/lib/services/spoken-bn";
import { fromLocal, toDhakaIso, toLocal } from "@/lib/services/time";
import { clinicFixture, dhaka, DR_FARHANA, DR_NUSRAT, DR_TANVIR } from "../support/clinic-fixture";

// Wednesday 4 Nov 2026, 09:00 Dhaka.
const NOW = dhaka("2026-11-04T09:00");
const clinic = clinicFixture();
const run = (o: Partial<Parameters<typeof computeSlots>[0]> & { isoDate: string }) =>
  computeSlots({ clinic, busy: [], now: NOW, ...o });
const times = (r: ReturnType<typeof computeSlots>) => r.slots.map((s) => s.start);

describe("time helpers (T1.3)", () => {
  it("round-trips Dhaka local time", () => {
    const d = fromLocal("2026-11-08", 18 * 60);
    expect(d.toISOString()).toBe("2026-11-08T12:00:00.000Z");
    expect(toDhakaIso(d)).toBe("2026-11-08T18:00:00+06:00");
    expect(toLocal(d)).toMatchObject({ isoDate: "2026-11-08", weekday: 0, minutes: 1080 });
  });
  it("UTC late evening is the next Dhaka day", () => {
    expect(toLocal(new Date("2026-11-04T19:00:00Z")).isoDate).toBe("2026-11-05");
  });
});

describe("spoken Bangla (FR-C9, FR-C22)", () => {
  it("speaks a slot like the sample dialogue", () => {
    expect(spokenDateTimeBn(dhaka("2026-11-08T18:00"))).toBe("রবিবার, আট নভেম্বর, সন্ধ্যা ছয়টা");
  });
  it("speaks half hours naturally", () => {
    expect(spokenTimeBn(10 * 60 + 30)).toBe("সকাল সাড়ে দশটা");
    expect(spokenTimeBn(13 * 60 + 30)).toBe("দুপুর দেড়টা");
    expect(spokenTimeBn(14 * 60 + 30)).toBe("বিকেল আড়াইটা");
    expect(spokenTimeBn(12 * 60)).toBe("দুপুর বারোটা");
    expect(spokenTimeBn(19 * 60 + 30)).toBe("রাত সাড়ে সাতটা");
  });
});

describe("computeSlots (T1.3, SRS 2 section 7.6)", () => {
  it("AT-1: next Sunday evening gives 3 evening slots with Dr. Nusrat", () => {
    const r = run({ isoDate: "2026-11-08", partOfDay: "evening" });
    expect(times(r)).toEqual([
      "2026-11-08T17:00:00+06:00",
      "2026-11-08T17:30:00+06:00",
      "2026-11-08T18:00:00+06:00",
    ]);
    expect(r.slots[0]?.doctorId).toBe(DR_NUSRAT);
    expect(r.slots[2]?.spokenBn).toBe("রবিবার, আট নভেম্বর, সন্ধ্যা ছয়টা, ডা. নুসরাত জাহান");
    expect(r.movedToLaterDays).toBeUndefined();
  });

  it("picks the slots closest to a clock time", () => {
    const r = run({ isoDate: "2026-11-08", time: "18:00" });
    expect(times(r)).toEqual([
      "2026-11-08T18:00:00+06:00",
      "2026-11-08T17:30:00+06:00",
      "2026-11-08T18:30:00+06:00",
    ]);
  });

  it("without time or part of day returns the earliest slots", () => {
    expect(times(run({ isoDate: "2026-11-08" }))[0]).toBe("2026-11-08T10:00:00+06:00");
  });

  it("never offers the prayer break 13:30 to 14:30", () => {
    const r = computeSlots({
      clinic,
      busy: [],
      now: NOW,
      isoDate: "2026-11-08",
      time: "14:00",
      max: 4,
    });
    expect(times(r)).not.toContain("2026-11-08T13:30:00+06:00");
    expect(times(r)).not.toContain("2026-11-08T14:00:00+06:00");
    expect(times(r)).toContain("2026-11-08T14:30:00+06:00");
    expect(times(r)).toContain("2026-11-08T13:00:00+06:00");
  });

  it("AT-12: Friday is closed, offers the next open days with a problem", () => {
    const r = run({ isoDate: "2026-11-06", partOfDay: "afternoon" });
    expect(r.problems).toEqual(["closed_friday"]);
    expect(r.movedToLaterDays).toBe(true);
    expect(times(r)).toEqual([
      "2026-11-07T14:30:00+06:00",
      "2026-11-08T14:30:00+06:00",
      "2026-11-09T14:30:00+06:00",
    ]);
  });

  it("past date is flagged in_past and moves to coming days", () => {
    const r = run({ isoDate: "2026-11-01" });
    expect(r.problems).toEqual(["in_past"]);
    expect(r.slots).toHaveLength(3);
    expect(r.slots.every((s) => s.start > "2026-11-04")).toBe(true);
  });

  it("today: skips past slots and the 30 min lead time", () => {
    const now = dhaka("2026-11-04T11:10");
    const r = computeSlots({ clinic, busy: [], now, isoDate: "2026-11-04" });
    expect(times(r)[0]).toBe("2026-11-04T12:00:00+06:00");
  });

  it("slot exactly at now + lead time is allowed", () => {
    const now = dhaka("2026-11-04T11:30");
    expect(times(computeSlots({ clinic, busy: [], now, isoDate: "2026-11-04" }))[0]).toBe(
      "2026-11-04T12:00:00+06:00",
    );
  });

  it("AT-13: taken slots are not offered", () => {
    const busy: BusySlot[] = [{ doctorId: DR_NUSRAT, start: dhaka("2026-11-08T18:00") }];
    const r = computeSlots({ clinic, busy, now: NOW, isoDate: "2026-11-08", time: "18:00" });
    expect(times(r)).not.toContain("2026-11-08T18:00:00+06:00");
    expect(times(r)[0]).toBe("2026-11-08T17:30:00+06:00");
  });

  it("a full day moves to the next 3 open days, skipping Friday", () => {
    const busy: BusySlot[] = [];
    for (let m = 10 * 60; m < 20 * 60; m += 30)
      busy.push({ doctorId: DR_NUSRAT, start: fromLocal("2026-11-05", m) });
    const r = computeSlots({ clinic, busy, now: NOW, isoDate: "2026-11-05", partOfDay: "morning" });
    expect(r.movedToLaterDays).toBe(true);
    expect(r.problems).toBeUndefined();
    expect(times(r)).toEqual([
      "2026-11-07T10:00:00+06:00",
      "2026-11-08T10:00:00+06:00",
      "2026-11-09T10:00:00+06:00",
    ]);
  });

  it("braces go to the orthodontist only, inside his hours", () => {
    const r = run({
      isoDate: "2026-11-07",
      serviceCode: "braces_consultation",
      partOfDay: "morning",
    });
    expect(r.slots.every((s) => s.doctorId === DR_TANVIR)).toBe(true);
    expect(times(r)[0]).toBe("2026-11-07T16:00:00+06:00");
  });

  it("braces on a day without the orthodontist moves to his next day", () => {
    const r = run({ isoDate: "2026-11-08", serviceCode: "braces_consultation" });
    expect(r.movedToLaterDays).toBe(true);
    expect(r.slots.every((s) => s.doctorId === DR_TANVIR)).toBe(true);
    expect(times(r)[0]).toBe("2026-11-09T16:00:00+06:00");
  });

  it("extraction prefers the oral surgeon on her days", () => {
    const r = run({ isoDate: "2026-11-08", serviceCode: "extraction", partOfDay: "morning" });
    expect(r.slots.every((s) => s.doctorId === DR_FARHANA)).toBe(true);
  });

  it("root canal falls back to the general dentist when no surgeon that day", () => {
    const r = run({ isoDate: "2026-11-07", serviceCode: "root_canal", partOfDay: "evening" });
    expect(r.movedToLaterDays).toBeUndefined();
    expect(r.slots.every((s) => s.doctorId === DR_NUSRAT)).toBe(true);
  });

  it("scaling uses the general dentist", () => {
    const r = run({ isoDate: "2026-11-07", serviceCode: "scaling", partOfDay: "evening" });
    expect(r.slots.every((s) => s.doctorId === DR_NUSRAT)).toBe(true);
  });

  it("doctor preference by Bangla name is honoured", () => {
    const r = run({ isoDate: "2026-11-08", serviceCode: "checkup", doctorPreference: "ফারহানা" });
    expect(r.slots.every((s) => s.doctorId === DR_FARHANA)).toBe(true);
  });

  it("evening request on a surgeon-only-morning service day returns closest same-day slots", () => {
    const r = run({ isoDate: "2026-11-08", serviceCode: "extraction", partOfDay: "evening" });
    expect(times(r)).toEqual([
      "2026-11-08T15:30:00+06:00",
      "2026-11-08T15:00:00+06:00",
      "2026-11-08T14:30:00+06:00",
    ]);
  });

  it("night request offers the last slot of the day", () => {
    expect(times(run({ isoDate: "2026-11-08", partOfDay: "night" }))[0]).toBe(
      "2026-11-08T19:30:00+06:00",
    );
  });

  it("returns at most 3 unique start times", () => {
    const r = run({ isoDate: "2026-11-07" });
    expect(r.slots).toHaveLength(3);
    expect(new Set(times(r)).size).toBe(3);
  });
});

describe("helpers (T1.3)", () => {
  it("matchDoctor finds by English name with title", () => {
    expect(matchDoctor(clinic.doctors, "Dr. Tanvir")?.id).toBe(DR_TANVIR);
    expect(matchDoctor(clinic.doctors, "unknown")).toBeUndefined();
  });
  it("braces ignores a non-orthodontist preference", () => {
    expect(doctorGroups(clinic.doctors, "braces_consultation", "Nusrat")).toEqual([
      [clinic.doctors[1]],
    ]);
  });
  it("isValidSlot rejects misaligned, closed, prayer and wrong-doctor slots", () => {
    expect(isValidSlot(clinic, DR_NUSRAT, dhaka("2026-11-08T18:00"), NOW)).toBe(true);
    expect(isValidSlot(clinic, DR_NUSRAT, dhaka("2026-11-08T18:15"), NOW)).toBe(false);
    expect(isValidSlot(clinic, DR_NUSRAT, dhaka("2026-11-06T18:00"), NOW)).toBe(false);
    expect(isValidSlot(clinic, DR_NUSRAT, dhaka("2026-11-08T14:00"), NOW)).toBe(false);
    expect(isValidSlot(clinic, DR_TANVIR, dhaka("2026-11-08T18:00"), NOW)).toBe(false);
    expect(isValidSlot(clinic, DR_NUSRAT, dhaka("2026-11-04T09:00"), NOW)).toBe(false);
  });
});
