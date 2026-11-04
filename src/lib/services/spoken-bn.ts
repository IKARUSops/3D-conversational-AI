/**
 * Small Bangla speaker for dates and clock times used by services (slot offers, booking
 * summaries). Agent B owns the full text toolkit in src/lib/text; this file only covers what
 * services need: "রবিবার, আট নভেম্বর, সন্ধ্যা ছয়টা".
 */
import type { PartOfDay } from "@/contracts";
import { toLocal } from "./time";

export const WEEKDAY_BN = [
  "রবিবার",
  "সোমবার",
  "মঙ্গলবার",
  "বুধবার",
  "বৃহস্পতিবার",
  "শুক্রবার",
  "শনিবার",
] as const;

export const MONTH_BN = [
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
] as const;

/** 0..31 as Bangla words (day of month). */
const NUM_BN = [
  "শূন্য",
  "এক",
  "দুই",
  "তিন",
  "চার",
  "পাঁচ",
  "ছয়",
  "সাত",
  "আট",
  "নয়",
  "দশ",
  "এগারো",
  "বারো",
  "তেরো",
  "চৌদ্দ",
  "পনেরো",
  "ষোলো",
  "সতেরো",
  "আঠারো",
  "উনিশ",
  "বিশ",
  "একুশ",
  "বাইশ",
  "তেইশ",
  "চব্বিশ",
  "পঁচিশ",
  "ছাব্বিশ",
  "সাতাশ",
  "আটাশ",
  "ঊনত্রিশ",
  "ত্রিশ",
  "একত্রিশ",
] as const;

/** Clock hours 1..12 with the "টা" classifier. */
const HOUR_BN = [
  "",
  "একটা",
  "দুইটা",
  "তিনটা",
  "চারটা",
  "পাঁচটা",
  "ছয়টা",
  "সাতটা",
  "আটটা",
  "নয়টা",
  "দশটা",
  "এগারোটা",
  "বারোটা",
] as const;

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

export function numberWordBn(n: number): string {
  return NUM_BN[n] ?? toBnDigits(n);
}

export function toBnDigits(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

/** Part of day for a local time (SRS 2 section 7.5 windows). */
export function partOfDayAt(minutes: number): PartOfDay {
  if (minutes < 12 * 60) return "morning";
  if (minutes < 14 * 60 + 30) return "noon";
  if (minutes < 17 * 60) return "afternoon";
  if (minutes < 19 * 60 + 30) return "evening";
  return "night";
}

export const PART_OF_DAY_BN: Record<PartOfDay, string> = {
  morning: "সকাল",
  noon: "দুপুর",
  afternoon: "বিকাল",
  evening: "সন্ধ্যা",
  night: "রাত",
};

const hour12 = (h: number): number => ((h + 11) % 12) + 1;

/** "সন্ধ্যা ছয়টা", "সকাল সাড়ে দশটা", "দুপুর দেড়টা", "বিকাল আড়াইটা". */
export function spokenTimeBn(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const pod = PART_OF_DAY_BN[partOfDayAt(minutes)];
  const h12 = hour12(h);
  let clock: string;
  if (m === 0) clock = HOUR_BN[h12] ?? "";
  else if (m === 30 && h12 === 1) clock = "দেড়টা";
  else if (m === 30 && h12 === 2) clock = "আড়াইটা";
  else if (m === 30) clock = `সাড়ে ${HOUR_BN[h12]}`;
  else if (m === 15) clock = `সোয়া ${HOUR_BN[h12]}`;
  else if (m === 45) clock = `পৌনে ${HOUR_BN[hour12(h + 1)]}`;
  else clock = `${HOUR_BN[h12]} ${numberWordBn(m)} মিনিট`;
  return `${pod} ${clock}`;
}

/** "রবিবার, আট নভেম্বর" for a Dhaka local date. */
export function spokenDateBn(isoDate: string): string {
  const [y, mo, d] = isoDate.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${WEEKDAY_BN[weekday]}, ${numberWordBn(d)} ${MONTH_BN[mo - 1]}`;
}

/** "রবিবার, আট নভেম্বর, সন্ধ্যা ছয়টা" for an instant (Dhaka time). */
export function spokenDateTimeBn(date: Date): string {
  const l = toLocal(date);
  return `${spokenDateBn(l.isoDate)}, ${spokenTimeBn(l.minutes)}`;
}
