/**
 * Numbers, times, dates and money as spoken Bangla words (SRS 2 section 7.5, FR-C22).
 * Bangla numbers 0 to 99 are irregular, so 0 to 99 is a full lookup table.
 */

const RAW_0_99 = [
  "শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়",
  "দশ", "এগারো", "বারো", "তেরো", "চৌদ্দ", "পনেরো", "ষোলো", "সতেরো", "আঠারো", "উনিশ",
  "বিশ", "একুশ", "বাইশ", "তেইশ", "চব্বিশ", "পঁচিশ", "ছাব্বিশ", "সাতাশ", "আটাশ", "ঊনত্রিশ",
  "ত্রিশ", "একত্রিশ", "বত্রিশ", "তেত্রিশ", "চৌত্রিশ", "পঁয়ত্রিশ", "ছত্রিশ", "সাঁইত্রিশ", "আটত্রিশ", "ঊনচল্লিশ",
  "চল্লিশ", "একচল্লিশ", "বিয়াল্লিশ", "তেতাল্লিশ", "চুয়াল্লিশ", "পঁয়তাল্লিশ", "ছেচল্লিশ", "সাতচল্লিশ", "আটচল্লিশ", "ঊনপঞ্চাশ",
  "পঞ্চাশ", "একান্ন", "বায়ান্ন", "তিপ্পান্ন", "চুয়ান্ন", "পঞ্চান্ন", "ছাপ্পান্ন", "সাতান্ন", "আটান্ন", "ঊনষাট",
  "ষাট", "একষট্টি", "বাষট্টি", "তেষট্টি", "চৌষট্টি", "পঁয়ষট্টি", "ছেষট্টি", "সাতষট্টি", "আটষট্টি", "ঊনসত্তর",
  "সত্তর", "একাত্তর", "বাহাত্তর", "তিয়াত্তর", "চুয়াত্তর", "পঁচাত্তর", "ছিয়াত্তর", "সাতাত্তর", "আটাত্তর", "ঊনআশি",
  "আশি", "একাশি", "বিরাশি", "তিরাশি", "চুরাশি", "পঁচাশি", "ছিয়াশি", "সাতাশি", "অষ্টাশি", "ঊননব্বই",
  "নব্বই", "একানব্বই", "বিরানব্বই", "তিরানব্বই", "চুরানব্বই", "পঁচানব্বই", "ছিয়ানব্বই", "সাতানব্বই", "আটানব্বই", "নিরানব্বই",
] as const;

/** 0 to 99 in Bangla words (NFC). */
export const BN_0_99: readonly string[] = RAW_0_99.map((w) => w.normalize("NFC"));

const n = (s: string) => s.normalize("NFC");

/**
 * Integer to Bangla words. 0 to 99,99,999 (Bangla lakh grouping) is supported; larger values
 * are read digit by digit.
 */
export function numberToBn(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value < 0) return n(`মাইনাস ${numberToBn(-value)}`);
  const v = Math.floor(value);
  if (v < 100) return BN_0_99[v]!;
  if (v > 9_999_999) {
    return String(v)
      .split("")
      .map((d) => BN_0_99[Number(d)])
      .join(" ");
  }
  const parts: string[] = [];
  const lakh = Math.floor(v / 100_000);
  const thousand = Math.floor((v % 100_000) / 1000);
  const hundred = Math.floor((v % 1000) / 100);
  const rest = v % 100;
  if (lakh) parts.push(`${BN_0_99[lakh]} লাখ`);
  if (thousand) parts.push(`${BN_0_99[thousand]} হাজার`);
  if (hundred) parts.push(`${BN_0_99[hundred]}শো`);
  if (rest) parts.push(BN_0_99[rest]!);
  return n(parts.join(" "));
}

/** "দশটা" style hour words: 1 to 12 plus a suffix like "টা" or "টায়". */
export function hourWordBn(hour12: number, suffix = "টা"): string {
  return n(`${BN_0_99[hour12]}${suffix}`);
}

export type BnDayPart = "সকাল" | "দুপুর" | "বিকেল" | "সন্ধ্যা" | "রাত";

/** Spoken part of day for a 24h hour/minute, as people in Dhaka say it. */
export function dayPartBn(hour24: number, minute = 0): string {
  const t = hour24 * 60 + minute;
  if (t < 4 * 60) return n("রাত");
  if (t < 12 * 60) return n("সকাল");
  if (t < 15 * 60) return n("দুপুর");
  if (t < 18 * 60) return n("বিকেল");
  if (t < 20 * 60) return n("সন্ধ্যা");
  return n("রাত");
}

/**
 * Time to Bangla words: 10:00 "সকাল দশটা", 18:30 "সন্ধ্যা সাড়ে ছয়টা", 17:15 "বিকেল সোয়া পাঁচটা",
 * 18:45 "সন্ধ্যা পৌনে সাতটা", 13:30 "দুপুর দেড়টা", 14:30 "দুপুর আড়াইটা", 18:10 "সন্ধ্যা ছয়টা দশ মিনিট".
 */
export function timeToBn(
  hour24: number,
  minute: number,
  opts: { withDayPart?: boolean; suffix?: string } = {},
): string {
  const { withDayPart = true, suffix = "টা" } = opts;
  const to12 = (h: number) => (h % 12 === 0 ? 12 : h % 12);
  const h12 = to12(hour24);
  let words: string;
  if (minute === 0) words = hourWordBn(h12, suffix);
  else if (minute === 30 && h12 === 1) words = n(`দেড়${suffix}`);
  else if (minute === 30 && h12 === 2) words = n(`আড়াই${suffix}`);
  else if (minute === 30) words = n(`সাড়ে ${hourWordBn(h12, suffix)}`);
  else if (minute === 15) words = n(`সোয়া ${hourWordBn(h12, suffix)}`);
  else if (minute === 45) words = n(`পৌনে ${hourWordBn(to12(hour24 + 1), suffix)}`);
  else words = n(`${hourWordBn(h12, "টা")} ${BN_0_99[minute]} মিনিট`);
  if (!withDayPart) return words;
  // "পৌনে সাতটা" belongs to the next hour's day part.
  const partHour = minute === 45 ? hour24 + 1 : hour24;
  return n(`${dayPartBn(partHour, minute === 45 ? 0 : minute)} ${words}`);
}

export const MONTHS_BN: readonly string[] = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
].map(n);

/** JS getDay() order (0 = Sunday). */
export const WEEKDAYS_BN: readonly string[] = [
  "রবিবার",
  "সোমবার",
  "মঙ্গলবার",
  "বুধবার",
  "বৃহস্পতিবার",
  "শুক্রবার",
  "শনিবার",
].map(n);

/** Day and month: (8, 11) to "আট নভেম্বর". `month` is 1 to 12. */
export function dateToBn(day: number, month: number): string {
  return n(`${BN_0_99[day]} ${MONTHS_BN[month - 1]}`);
}

/** Money: 1500 to "এক হাজার পাঁচশো টাকা". */
export function moneyToBn(amount: number): string {
  return n(`${numberToBn(amount)} টাকা`);
}
