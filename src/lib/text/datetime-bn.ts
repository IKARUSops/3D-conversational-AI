/**
 * Bangla + English date/time phrase resolver (SRS 2 section 7.5, FR-C9).
 * The LLM passes the caller's words; code decides the date. Timezone Asia/Dhaka (UTC+6, no DST).
 *
 * resolve("আগামী রবিবার সন্ধ্যায়", now, settings) ->
 *   { ok: true, isoDate: "2026-11-08", partOfDay: "evening", spokenBn: "রবিবার, আট নভেম্বর, সন্ধ্যা", problems: [] }
 */
import type { ClinicSettings, DatetimeProblem, PartOfDay, ResolveDatetimeOutput } from "@/contracts";
import { BN_0_99, WEEKDAYS_BN, dateToBn, timeToBn } from "./bangla-numbers";
import { normalizeForMatch } from "./normalize";

const n = (s: string) => s.normalize("NFC");
const nl = (list: string[]) => list.map(n);

export type DatetimeSettings = Pick<
  ClinicSettings,
  "openWeekdays" | "open" | "close" | "prayerBreak"
> & { leadMinutes?: number };

/** Clinic defaults from SRS 1 section 4.4 (used when settings are missing). */
export const DEFAULT_DATETIME_SETTINGS: DatetimeSettings = {
  openWeekdays: [0, 1, 2, 3, 4, 6],
  open: "10:00",
  close: "20:00",
  prayerBreak: { start: "13:30", end: "14:30" },
  leadMinutes: 30,
};

/** Part-of-day windows in minutes from midnight (contracts PartOfDay). */
export const PART_WINDOWS: Record<PartOfDay, [number, number]> = {
  morning: [10 * 60, 12 * 60],
  noon: [12 * 60, 13 * 60 + 30],
  afternoon: [14 * 60 + 30, 17 * 60],
  evening: [17 * 60, 19 * 60 + 30],
  night: [19 * 60 + 30, 20 * 60],
};

export const PART_BN: Record<PartOfDay, string> = {
  morning: n("সকাল"),
  noon: n("দুপুর"),
  afternoon: n("বিকেল"),
  evening: n("সন্ধ্যা"),
  night: n("রাত"),
};

// ---------------------------------------------------------------------------
// Dhaka calendar helpers (day numbers = days since 1970-01-01 in Dhaka)
// ---------------------------------------------------------------------------

const DHAKA_OFFSET_MIN = 6 * 60;
const DAY_MS = 86_400_000;

export interface DhakaNow {
  dayNum: number;
  minutes: number;
  weekday: number;
}

export function dhakaNow(now: Date): DhakaNow {
  const local = now.getTime() + DHAKA_OFFSET_MIN * 60_000;
  const dayNum = Math.floor(local / DAY_MS);
  const minutes = Math.floor((local - dayNum * DAY_MS) / 60_000);
  return { dayNum, minutes, weekday: (dayNum + 4) % 7 }; // 1970-01-01 was a Thursday
}

export function dayNumToParts(dayNum: number): { y: number; m: number; d: number; weekday: number } {
  const dt = new Date(dayNum * DAY_MS);
  return {
    y: dt.getUTCFullYear(),
    m: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
    weekday: (((dayNum + 4) % 7) + 7) % 7,
  };
}

export function partsToDayNum(y: number, m: number, d: number): number | null {
  const ms = Date.UTC(y, m - 1, d);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return Math.floor(ms / DAY_MS);
}

export function dayNumToIso(dayNum: number): string {
  const { y, m, d } = dayNumToParts(dayNum);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" + "HH:MM" in Dhaka to an ISO string with +06:00. */
export function dhakaIso(isoDate: string, hhmm: string): string {
  return `${isoDate}T${hhmm}:00+06:00`;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const fmtHm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Spoken date: "রবিবার, আট নভেম্বর". */
export function spokenDateBn(dayNum: number): string {
  const { m, d, weekday } = dayNumToParts(dayNum);
  return n(`${WEEKDAYS_BN[weekday]}, ${dateToBn(d, m)}`);
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const WEEKDAY_BN_STEMS: Array<[number, string[]]> = [
  [0, nl(["রবি", "রোব"])],
  [1, nl(["সোম"])],
  [2, nl(["মঙ্গল"])],
  [3, nl(["বুধ"])],
  [4, nl(["বৃহস্পতি", "বিষ্যুদ", "বিস্যুদ", "বেস্পতি"])],
  [5, nl(["শুক্র"])],
  [6, nl(["শনি"])],
];
const WEEKDAY_EN: Array<[number, string[]]> = [
  [0, ["sunday", "sun"]],
  [1, ["monday", "mon"]],
  [2, ["tuesday", "tue", "tues"]],
  [3, ["wednesday", "wed"]],
  [4, ["thursday", "thu", "thurs"]],
  [5, ["friday", "fri"]],
  [6, ["saturday", "sat"]],
];

const TODAY = nl(["আজ", "আজকে", "আজকেই", "আজই", "আজকের", "today", "tonight"]);
const TOMORROW = nl([
  "কাল",
  "কালকে",
  "কালকেই",
  "কালই",
  "কালকের",
  "আগামীকাল",
  "আগামীকালকে",
  "আগামীকালের",
  "tomorrow",
  "tmrw",
  "tomorow",
]);
const DAY_AFTER = nl(["পরশু", "পরশুদিন", "পরশুকে"]);
const YESTERDAY = nl(["গতকাল", "গতকালকে", "yesterday"]);
const LAST = nl(["গত", "last", "previous"]);
const NEXT = nl(["আগামী", "সামনের", "সামনে", "next", "coming", "upcoming"]);
const THIS = nl(["এই", "this"]);
/** STT often writes "আমি রবিবার" for "আগামী রবিবার". */
const MISHEARD_NEXT = nl(["আমি", "আমী"]);

const PART_TOKENS: Array<[PartOfDay, string[]]> = [
  ["morning", nl(["সকাল", "ভোর", "morning"])],
  ["noon", nl(["দুপুর", "noon", "midday", "lunch"])],
  ["afternoon", nl(["বিকাল", "বিকেল", "afternoon"])],
  ["evening", nl(["সন্ধ্যা", "সন্ধা", "সন্ধে", "evening"])],
  ["night", nl(["রাত", "night", "tonight"])],
];

const HOUR_WORDS: Array<[string, number]> = (
  [
    ["এক", 1],
    ["দুই", 2],
    ["দু", 2],
    ["তিন", 3],
    ["চার", 4],
    ["পাঁচ", 5],
    ["ছয়", 6],
    ["ছ", 6],
    ["সাত", 7],
    ["আট", 8],
    ["নয়", 9],
    ["দশ", 10],
    ["এগারো", 11],
    ["এগার", 11],
    ["বারো", 12],
    ["বার", 12],
  ] as Array<[string, number]>
).map(([w, v]) => [n(w), v]);

const EN_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const MONTHS: Array<[number, string[]]> = [
  [1, [...nl(["জানুয়ারি", "জানুয়ারী", "জানুয়ারি"]), "january", "jan"]],
  [2, [...nl(["ফেব্রুয়ারি", "ফেব্রুয়ারী", "ফেব্রুয়ারি"]), "february", "feb"]],
  [3, [...nl(["মার্চ"]), "march", "mar"]],
  [4, [...nl(["এপ্রিল"]), "april", "apr"]],
  [5, [...nl(["মে"]), "may"]],
  [6, [...nl(["জুন"]), "june", "jun"]],
  [7, [...nl(["জুলাই"]), "july", "jul"]],
  [8, [...nl(["আগস্ট", "আগষ্ট", "অগাস্ট", "অগস্ট"]), "august", "aug"]],
  [9, [...nl(["সেপ্টেম্বর"]), "september", "sep", "sept"]],
  [10, [...nl(["অক্টোবর"]), "october", "oct"]],
  [11, [...nl(["নভেম্বর"]), "november", "nov"]],
  [12, [...nl(["ডিসেম্বর"]), "december", "dec"]],
];

const TARIKH = n("তারিখ");
const TA = n("টা");
const TO = n("টো");
const MINUTE = n("মিনিট");
const SARE = nl(["সাড়ে", "সারে"]);
const SOA = nl(["সোয়া", "সওয়া"]);
const POUNE = nl(["পৌনে", "পোনে"]);
const DER = n("দেড়");
const ARAI = n("আড়াই");

// ---------------------------------------------------------------------------
// Token matchers
// ---------------------------------------------------------------------------

function weekdayOf(token: string): number | null {
  for (const [wd, stems] of WEEKDAY_BN_STEMS) {
    for (const stem of stems) {
      if (token === stem || token.startsWith(`${stem}${n("বার")}`)) return wd;
    }
  }
  const t = token.replace(/'s$/, "").replace(/s$/, "");
  for (const [wd, names] of WEEKDAY_EN) {
    if (names.includes(token) || names.includes(t)) return wd;
  }
  return null;
}

function partOf(token: string): PartOfDay | null {
  for (const [part, words] of PART_TOKENS) {
    for (const w of words) {
      if (token === w || (/^\p{Script=Bengali}/u.test(w) && token.startsWith(w))) {
        // "রাত" must not swallow unrelated words; Bangla suffixes are short.
        if (token.length - w.length <= 3) return part;
      }
    }
  }
  return null;
}

function monthOf(token: string): number | null {
  for (const [m, names] of MONTHS) {
    for (const name of names) {
      if (token === name || (name.length > 3 && /^\p{Script=Bengali}/u.test(name) && token.startsWith(name) && token.length - name.length <= 2)) {
        return m;
      }
    }
  }
  return null;
}

/** Number 1 to 31 from digits ("20", "20th", "20শে") or Bangla words ("বিশ"). */
function smallNumber(token: string): number | null {
  const m = /^(\d{1,2})(st|nd|rd|th|শে|ই|লা|রা|ঠা)?$/u.exec(token);
  if (m) return Number(m[1]);
  const idx = BN_0_99.indexOf(token);
  if (idx >= 0 && idx <= 59) return idx;
  return null;
}

/** Hour from a token like "10টা", "দশটায়", "6pm", "6", "six". Returns hour and am/pm flag. */
function hourToken(token: string): { h: number; m?: number; ampm?: "am" | "pm"; strong: boolean } | null {
  let mm = /^(\d{1,2})(?:টা\S*|টো\S*)$/u.exec(token);
  if (mm) return { h: Number(mm[1]), strong: true };
  mm = /^(\d{1,2})(am|pm|a\.m\.?|p\.m\.?)$/.exec(token);
  if (mm) return { h: Number(mm[1]), ampm: mm[2]!.startsWith("p") ? "pm" : "am", strong: true };
  mm = /^(\d{1,2}):(\d{2})(am|pm)?$/.exec(token);
  if (mm) {
    return {
      h: Number(mm[1]),
      m: Number(mm[2]),
      ampm: mm[3] ? (mm[3] === "pm" ? "pm" : "am") : undefined,
      strong: true,
    };
  }
  if (token.startsWith(DER) && token.slice(DER.length).startsWith(TA)) return { h: 1, m: 30, strong: true };
  if (token.startsWith(ARAI) && token.slice(ARAI.length).startsWith(TA)) return { h: 2, m: 30, strong: true };
  for (const [w, v] of HOUR_WORDS) {
    if (token.startsWith(w)) {
      const rest = token.slice(w.length);
      // "একটা" also means "one/a" ("একটা appointment"), so it is weak without a day part.
      if (rest.startsWith(TA) || rest.startsWith(TO)) return { h: v, strong: v !== 1 || rest !== TA };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

interface Parsed {
  dayNum?: number;
  weekday?: number;
  weekdayMode?: "next" | "this";
  partOfDay?: PartOfDay;
  minutes?: number;
  problems: Set<DatetimeProblem>;
}

function to24h(h: number, part: PartOfDay | undefined, ampm: "am" | "pm" | undefined): number {
  if (ampm === "pm") return h < 12 ? h + 12 : h;
  if (ampm === "am") return h === 12 ? 0 : h;
  if (h > 12) return h; // already 24h
  switch (part) {
    case "morning":
      return h === 12 ? 12 : h;
    case "noon":
      return h === 12 ? 12 : h < 6 ? h + 12 : h;
    case "afternoon":
    case "evening":
    case "night":
      return h < 12 ? h + 12 : h;
    default:
      // Ambiguous hour without part of day: 8 to 11 AM, 1 to 7 PM, 12 noon (SRS 2 section 7.5).
      if (h === 12) return 12;
      if (h >= 1 && h <= 7) return h + 12;
      return h;
  }
}

/** Part of day for a 24h time (contract windows). */
export function partOfDayFor(minutes: number): PartOfDay {
  if (minutes < 12 * 60) return "morning";
  if (minutes < 14 * 60 + 30) return "noon";
  if (minutes < 17 * 60) return "afternoon";
  if (minutes < 19 * 60 + 30) return "evening";
  return "night";
}

function parse(phrase: string, now: DhakaNow): Parsed {
  const text = normalizeForMatch(phrase)
    .replace(/[,;!?।"“”()]/g, " ")
    .replace(/o'clock|o’clock/g, " oclock ")
    .replace(/(\d)\s+(am|pm|a\.m\.?|p\.m\.?)(?=\s|$)/g, "$1$2")
    .replace(/(\d)\s+(টা|টো)/gu, "$1$2");
  const tokens = text.split(/\s+/).filter(Boolean);
  const p: Parsed = { problems: new Set() };
  let hour: { h: number; m?: number; ampm?: "am" | "pm" } | undefined;
  let minuteAdj = 0;
  let hourMinus = 0;
  let extraMinutes: number | undefined;

  const has = (list: string[]) => tokens.some((t) => list.includes(t));

  // Relative days and past words.
  if (/day after tomorrow/.test(text) || has(DAY_AFTER)) p.dayNum = now.dayNum + 2;
  else if (has(YESTERDAY)) {
    p.dayNum = now.dayNum - 1;
    p.problems.add("in_past");
  } else if (has(TOMORROW) || /আগামী কাল(?:কে)?(?:\s|$)/u.test(text)) p.dayNum = now.dayNum + 1;
  else if (has(TODAY)) p.dayNum = now.dayNum;
  if (tokens.includes("tonight")) p.partOfDay = "night";

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const prev = tokens[i - 1];
    const next = tokens[i + 1];

    // ISO date or d/m(/y).
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(tok);
    if (m) {
      const dn = partsToDayNum(Number(m[1]), Number(m[2]), Number(m[3]));
      if (dn !== null) p.dayNum = dn;
      continue;
    }
    m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(tok);
    if (m) {
      const today = dayNumToParts(now.dayNum);
      let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : today.y;
      let dn = partsToDayNum(y, Number(m[2]), Number(m[1]));
      if (dn !== null && !m[3] && dn < now.dayNum) {
        y += 1;
        dn = partsToDayNum(y, Number(m[2]), Number(m[1]));
      }
      if (dn !== null) p.dayNum = dn;
      continue;
    }

    // Day + month ("8 নভেম্বর", "নভেম্বর 8", "8th november").
    const month = monthOf(tok);
    if (month !== null) {
      const dayTok = prev !== undefined && smallNumber(prev) !== null ? prev : next;
      const day = dayTok !== undefined ? smallNumber(dayTok) : null;
      const dayBefore = tokens[i - 2] !== undefined && prev === TARIKH ? smallNumber(tokens[i - 2]!) : null;
      const d = day ?? dayBefore;
      if (d !== null && d >= 1 && d <= 31) {
        const today = dayNumToParts(now.dayNum);
        let dn = partsToDayNum(today.y, month, d);
        if (dn !== null && dn < now.dayNum) dn = partsToDayNum(today.y + 1, month, d);
        if (dn !== null) p.dayNum = dn;
      }
      continue;
    }

    // "20 তারিখ" / "বিশ তারিখে" / "the 20th".
    if (tok.startsWith(TARIKH) && prev !== undefined && p.dayNum === undefined) {
      const d = smallNumber(prev);
      if (d !== null && d >= 1 && d <= 31) {
        const today = dayNumToParts(now.dayNum);
        let dn = partsToDayNum(today.y, today.m, d);
        if (dn === null || dn < now.dayNum) {
          const ny = today.m === 12 ? today.y + 1 : today.y;
          const nm = today.m === 12 ? 1 : today.m + 1;
          dn = partsToDayNum(ny, nm, d);
        }
        if (dn !== null) p.dayNum = dn;
      }
      continue;
    }
    if (/^\d{1,2}(st|nd|rd|th)$/.test(tok) && p.dayNum === undefined && monthOf(next ?? "") === null) {
      const d = Number(tok.replace(/\D/g, ""));
      const today = dayNumToParts(now.dayNum);
      let dn = partsToDayNum(today.y, today.m, d);
      if (dn === null || dn < now.dayNum) {
        dn = partsToDayNum(today.m === 12 ? today.y + 1 : today.y, today.m === 12 ? 1 : today.m + 1, d);
      }
      if (dn !== null) p.dayNum = dn;
      continue;
    }

    // Weekday with modifier.
    const wd = weekdayOf(tok);
    if (wd !== null) {
      p.weekday = wd;
      if (prev !== undefined && LAST.includes(prev)) {
        p.weekdayMode = "this";
        p.problems.add("in_past");
      } else if (prev !== undefined && NEXT.includes(prev)) p.weekdayMode = "next";
      else if (prev !== undefined && MISHEARD_NEXT.includes(prev)) {
        p.weekdayMode = "next";
        p.problems.add("low_confidence");
      } else if (prev !== undefined && THIS.includes(prev)) p.weekdayMode = "this";
      else p.weekdayMode = "this"; // a bare weekday means the coming one
      continue;
    }

    // Parts of day.
    const part = partOf(tok);
    if (part !== null) {
      p.partOfDay = part;
      continue;
    }

    // Clock time modifiers.
    if (SARE.includes(tok)) {
      minuteAdj = 30;
      continue;
    }
    if (SOA.includes(tok)) {
      minuteAdj = 15;
      continue;
    }
    if (POUNE.includes(tok)) {
      minuteAdj = 45;
      hourMinus = 1;
      continue;
    }
    if (tok === "half" && next === "past") {
      minuteAdj = 30;
      continue;
    }
    if (tok === "quarter" && next === "past") {
      minuteAdj = 15;
      continue;
    }
    if (tok === "quarter" && next === "to") {
      minuteAdj = 45;
      hourMinus = 1;
      continue;
    }

    // Clock time.
    const ht = hourToken(tok);
    const hasPartWord = tokens.some((t) => partOf(t) !== null);
    if (ht && !hour && (ht.strong || hasPartWord)) {
      hour = { h: ht.h, m: ht.m, ampm: ht.ampm };
      // "ছয়টা দশ মিনিট" / "6টা 10 মিনিটে"
      const after = tokens[i + 2];
      if (next !== undefined && after !== undefined && after.startsWith(MINUTE)) {
        const mins = smallNumber(next);
        if (mins !== null && mins < 60) extraMinutes = mins;
      }
      continue;
    }
    // Bare numbers / English words only with a clear time context.
    const enH = EN_NUM[tok] ?? (/^\d{1,2}$/.test(tok) ? Number(tok) : undefined);
    if (enH !== undefined && !hour && enH >= 1 && enH <= 12) {
      const ampm = next === "am" || next === "a.m." ? "am" : next === "pm" || next === "p.m." ? "pm" : undefined;
      const atBefore = prev === "at" || prev === "past" || prev === "to" || prev === "by";
      if (ampm || atBefore || next === "oclock" || next === TA) {
        hour = { h: enH, ampm };
      }
    }
  }

  if (hour) {
    let h = hour.h - hourMinus;
    if (h <= 0) h += 12;
    const baseMin = hour.m ?? extraMinutes ?? 0;
    const h24 = to24h(h, p.partOfDay, hour.ampm);
    p.minutes = h24 * 60 + (minuteAdj || baseMin);
    if (p.minutes >= 24 * 60) p.minutes -= 24 * 60;
    if (!p.partOfDay) p.partOfDay = partOfDayFor(p.minutes);
  }
  return p;
}

function bookableLater(now: DhakaNow, settings: DatetimeSettings, p: Parsed): boolean {
  const lead = settings.leadMinutes ?? 0;
  const latestStart = toMin(settings.close) - 30;
  if (p.minutes !== undefined) return p.minutes >= now.minutes + lead;
  if (p.partOfDay) return PART_WINDOWS[p.partOfDay][1] > now.minutes + lead;
  return latestStart >= now.minutes + lead;
}

/**
 * Resolve a caller's date/time phrase. `now` is any Date; the result is in Asia/Dhaka.
 */
export function resolve(
  phrase: string,
  now: Date,
  settings: DatetimeSettings = DEFAULT_DATETIME_SETTINGS,
): ResolveDatetimeOutput {
  const dn = dhakaNow(now);
  const p = parse(phrase ?? "", dn);
  const problems = p.problems;

  let dayNum = p.dayNum;
  if (dayNum === undefined && p.weekday !== undefined) {
    const diff = (p.weekday - dn.weekday + 7) % 7;
    if (problems.has("in_past")) dayNum = dn.dayNum - (diff === 0 ? 7 : 7 - diff);
    else if (p.weekdayMode === "next") dayNum = dn.dayNum + (diff === 0 ? 7 : diff);
    else dayNum = dn.dayNum + (diff === 0 ? (bookableLater(dn, settings, p) ? 0 : 7) : diff);
  }
  if (dayNum === undefined && (p.minutes !== undefined || p.partOfDay !== undefined)) {
    dayNum = bookableLater(dn, settings, p) ? dn.dayNum : dn.dayNum + 1;
  }

  if (dayNum === undefined) {
    return { ok: false, spokenBn: "", problems: ["unparsed"] };
  }

  const { weekday } = dayNumToParts(dayNum);
  if (dayNum < dn.dayNum) problems.add("in_past");
  if (dayNum === dn.dayNum) {
    if (p.minutes !== undefined && p.minutes <= dn.minutes) problems.add("in_past");
    else if (p.minutes === undefined && p.partOfDay && PART_WINDOWS[p.partOfDay][1] <= dn.minutes) {
      problems.add("in_past");
    }
  }
  if (!settings.openWeekdays.includes(weekday)) {
    problems.add(weekday === 5 ? "closed_friday" : "outside_hours");
  }
  if (p.minutes !== undefined) {
    if (p.minutes < toMin(settings.open) || p.minutes >= toMin(settings.close)) problems.add("outside_hours");
    else if (p.minutes >= toMin(settings.prayerBreak.start) && p.minutes < toMin(settings.prayerBreak.end)) {
      problems.add("prayer_break");
    }
  }

  let spoken = spokenDateBn(dayNum);
  if (p.minutes !== undefined) spoken += `, ${timeToBn(Math.floor(p.minutes / 60), p.minutes % 60)}`;
  else if (p.partOfDay) spoken += `, ${PART_BN[p.partOfDay]}`;

  const list = [...problems];
  return {
    ok: list.every((x) => x === "low_confidence"),
    isoDate: dayNumToIso(dayNum),
    ...(p.partOfDay ? { partOfDay: p.partOfDay } : {}),
    ...(p.minutes !== undefined ? { time: fmtHm(p.minutes) } : {}),
    spokenBn: n(spoken),
    problems: list,
  };
}

/** Today in Dhaka for the system prompt: weekday, spoken date, ISO date and HH:MM. */
export function todayInfo(now: Date): { weekdayBn: string; dateBn: string; iso: string; timeHm: string; timeBn: string } {
  const dn = dhakaNow(now);
  const { d, m, weekday } = dayNumToParts(dn.dayNum);
  return {
    weekdayBn: WEEKDAYS_BN[weekday]!,
    dateBn: dateToBn(d, m),
    iso: dayNumToIso(dn.dayNum),
    timeHm: fmtHm(dn.minutes),
    timeBn: timeToBn(Math.floor(dn.minutes / 60), dn.minutes % 60),
  };
}

/**
 * Day facts for the prompt, all computed in code (TC-05: the LLM said "শনিবার, পাঁচ নভেম্বর"
 * for Saturday 7 November). Lines like "Tomorrow: শুক্রবার, ছয় নভেম্বর (CLOSED)".
 */
export function upcomingDaysBn(now: Date, settings: Pick<ClinicSettings, "openWeekdays">): string[] {
  const today = dhakaNow(now).dayNum;
  const label = (dayNum: number) => {
    const { d, m, weekday } = dayNumToParts(dayNum);
    return `${WEEKDAYS_BN[weekday]!}, ${dateToBn(d, m)}`;
  };
  const open = (dayNum: number) => settings.openWeekdays.includes(dayNumToParts(dayNum).weekday);
  const lines = [
    `Today: ${label(today)}${open(today) ? "" : " (CLOSED)"}`,
    `Tomorrow (say কাল): ${label(today + 1)}${open(today + 1) ? "" : " (CLOSED)"}`,
  ];
  for (let k = 1; k <= 7; k++) {
    if (open(today + k)) {
      lines.push(`Next open day after today: ${label(today + k)}`);
      break;
    }
  }
  return lines;
}
