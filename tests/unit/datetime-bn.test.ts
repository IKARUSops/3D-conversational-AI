import { describe, expect, it } from "vitest";
import { resolve, todayInfo } from "@/lib/text/datetime-bn";

const N = (s: string) => s.normalize("NFC");
/** Wednesday 4 Nov 2026, 10:00 in Dhaka (04:00 UTC). */
const NOW = new Date("2026-11-04T04:00:00Z");
const at = (iso: string) => new Date(iso);

describe("T2.2 FR-C9 datetime-bn: owner phrases", () => {
  it("আগামী রবিবার সন্ধ্যায় -> Sunday 8 Nov evening", () => {
    const r = resolve("আগামী রবিবার সন্ধ্যায়", NOW);
    expect(r).toMatchObject({ ok: true, isoDate: "2026-11-08", partOfDay: "evening", problems: [] });
    expect(r.spokenBn).toBe(N("রবিবার, আট নভেম্বর, সন্ধ্যা"));
  });
  it("কালকে সকাল দশটায় -> tomorrow 10:00", () => {
    const r = resolve("কালকে সকাল দশটায়", NOW);
    expect(r).toMatchObject({ ok: true, isoDate: "2026-11-05", time: "10:00", partOfDay: "morning" });
    expect(r.spokenBn).toBe(N("বৃহস্পতিবার, পাঁচ নভেম্বর, সকাল দশটা"));
  });
  it("next Sunday evening (English)", () => {
    expect(resolve("next Sunday evening", NOW)).toMatchObject({
      ok: true,
      isoDate: "2026-11-08",
      partOfDay: "evening",
    });
  });
  it("misheard আমি রবিবার -> next Sunday with low_confidence", () => {
    const r = resolve("আমি রবিবার", NOW);
    expect(r).toMatchObject({ ok: true, isoDate: "2026-11-08", problems: ["low_confidence"] });
  });
});

describe("T2.2 FR-C9 datetime-bn: relative days", () => {
  it("আজ বিকালে", () => {
    expect(resolve("আজ বিকালে", NOW)).toMatchObject({ isoDate: "2026-11-04", partOfDay: "afternoon", ok: true });
  });
  it("আগামীকাল and tomorrow", () => {
    expect(resolve("আগামীকাল", NOW).isoDate).toBe("2026-11-05");
    expect(resolve("tomorrow 11am", NOW)).toMatchObject({ isoDate: "2026-11-05", time: "11:00" });
  });
  it("পরশু is day after tomorrow, which is Friday: closed", () => {
    expect(resolve("পরশু", NOW)).toMatchObject({ ok: false, isoDate: "2026-11-06", problems: ["closed_friday"] });
  });
  it("গতকাল is rejected as in_past", () => {
    expect(resolve("গতকাল", NOW).problems).toContain("in_past");
  });
});

describe("T2.2 FR-C9 datetime-bn: weekdays", () => {
  it("আগামী বুধবার on a Wednesday means next week", () => {
    expect(resolve("আগামী বুধবার", NOW).isoDate).toBe("2026-11-11");
  });
  it("এই বুধবার on a Wednesday morning is today", () => {
    expect(resolve("এই বুধবার", NOW).isoDate).toBe("2026-11-04");
  });
  it("this Wednesday after closing time is next week", () => {
    expect(resolve("this wednesday", at("2026-11-04T14:00:00Z")).isoDate).toBe("2026-11-11");
  });
  it("সামনের শনিবার and রোববার spelling", () => {
    expect(resolve("সামনের শনিবার", NOW).isoDate).toBe("2026-11-07");
    expect(resolve("রোববার সকালে", NOW).isoDate).toBe("2026-11-08");
  });
  it("শুক্রবার is closed", () => {
    expect(resolve("শুক্রবার বিকেলে", NOW)).toMatchObject({ ok: false, problems: ["closed_friday"] });
  });
});

describe("T2.2 FR-C9 datetime-bn: dates", () => {
  it("২০ তারিখ is this month", () => {
    expect(resolve("২০ তারিখ", NOW).isoDate).toBe("2026-11-20");
  });
  it("২ তারিখ already passed -> next month", () => {
    expect(resolve("২ তারিখে", NOW).isoDate).toBe("2026-12-02");
  });
  it("বিশ তারিখ with Bangla number words", () => {
    expect(resolve("বিশ তারিখ", NOW).isoDate).toBe("2026-11-20");
  });
  it("৮ নভেম্বর and 15 december and january rollover", () => {
    expect(resolve("৮ নভেম্বর", NOW).isoDate).toBe("2026-11-08");
    expect(resolve("December 15th", NOW).isoDate).toBe("2026-12-15");
    expect(resolve("৫ জানুয়ারি", NOW).isoDate).toBe("2027-01-05");
  });
});

describe("T2.2 FR-C9 datetime-bn: clock times", () => {
  it("সন্ধ্যা সাড়ে ছয়টা -> 18:30", () => {
    expect(resolve("সোমবার সন্ধ্যা সাড়ে ছয়টা", NOW)).toMatchObject({ time: "18:30", isoDate: "2026-11-09" });
  });
  it("পৌনে সাতটা -> 18:45 and সোয়া পাঁচটা -> 17:15", () => {
    expect(resolve("কাল পৌনে সাতটায়", NOW).time).toBe("18:45");
    expect(resolve("কাল সোয়া পাঁচটা", NOW).time).toBe("17:15");
  });
  it("ambiguous hours: 10টা AM, ৪টা PM", () => {
    expect(resolve("কাল ১০টা", NOW).time).toBe("10:00");
    expect(resolve("কাল ৪টায়", NOW).time).toBe("16:00");
  });
  it("10:30 and 6 pm", () => {
    expect(resolve("tomorrow 10:30", NOW).time).toBe("10:30");
    expect(resolve("sunday 6 pm", NOW).time).toBe("18:00");
  });
  it("prayer break and outside hours", () => {
    expect(resolve("কাল দুপুর দেড়টা", NOW).problems).toEqual(["prayer_break"]);
    expect(resolve("কাল রাত নয়টা", NOW).problems).toEqual(["outside_hours"]);
    expect(resolve("কাল সকাল আটটা", NOW).problems).toEqual(["outside_hours"]);
  });
  it("time already passed today is in_past", () => {
    expect(resolve("আজ সকাল দশটা", at("2026-11-04T05:00:00Z")).problems).toContain("in_past");
  });
  it("time only: later today, or tomorrow when passed", () => {
    expect(resolve("সন্ধ্যায়", NOW).isoDate).toBe("2026-11-04");
    expect(resolve("সকালে", at("2026-11-04T10:00:00Z")).isoDate).toBe("2026-11-05");
  });
  it("একটা in 'একটা appointment' is not 1 PM", () => {
    expect(resolve("কাল একটা appointment", NOW).time).toBeUndefined();
  });
});

describe("T2.2 datetime-bn: unparsed and helpers", () => {
  it("nonsense is unparsed", () => {
    expect(resolve("ক্রিকেট খেলা", NOW)).toEqual({ ok: false, spokenBn: "", problems: ["unparsed"] });
  });
  it("todayInfo is in Asia/Dhaka", () => {
    expect(todayInfo(at("2026-11-04T19:00:00Z"))).toMatchObject({ iso: "2026-11-05", timeHm: "01:00" });
  });
});

describe("upcomingDaysBn (TC-05: dates come from code)", async () => {
  const { upcomingDaysBn } = await import("@/lib/text/datetime-bn");
  it("Thursday: tomorrow is closed Friday, next open day is Saturday 7 November", () => {
    const lines = upcomingDaysBn(new Date("2026-11-05T06:00:00Z"), { openWeekdays: [0, 1, 2, 3, 4, 6] });
    expect(lines[0]).toContain("বৃহস্পতিবার".normalize("NFC"));
    expect(lines[1]).toContain("(CLOSED)");
    expect(lines[1]).toContain("শুক্রবার".normalize("NFC"));
    expect(lines[2]).toContain("শনিবার".normalize("NFC"));
    expect(lines[2]).toContain("সাত নভেম্বর".normalize("NFC"));
  });
});

describe("English weekday words in Bangla script (TC-09)", () => {
  // Thursday 5 November 2026, 19:00 Dhaka.
  const THU = new Date("2026-11-05T13:00:00Z");
  it("নেক্সট মানডে বিকেল is Monday 9 November, not tomorrow", () => {
    expect(resolve("নেক্সট মানডে বিকেল".normalize("NFC"), THU)).toMatchObject({ isoDate: "2026-11-09", partOfDay: "afternoon" });
  });
  it("স্যাটারডে সকালে is Saturday 7 November", () => {
    expect(resolve("স্যাটারডে সকালে".normalize("NFC"), THU)).toMatchObject({ isoDate: "2026-11-07", partOfDay: "morning" });
  });
});
