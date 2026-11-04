/**
 * Asia/Dhaka time helpers for services. Bangladesh has no daylight saving, so a fixed
 * UTC+06:00 offset is exact (docs/DECISIONS.md A-03). Pure functions, no env, no DB.
 */

export const DHAKA_OFFSET_MIN = 6 * 60;
const MIN_MS = 60_000;
const DAY_MS = 24 * 60 * MIN_MS;

export interface LocalParts {
  /** "YYYY-MM-DD" in Dhaka. */
  isoDate: string;
  /** JS getDay() in Dhaka (0 = Sunday). */
  weekday: number;
  /** Minutes since local midnight. */
  minutes: number;
  year: number;
  /** 1..12 */
  month: number;
  day: number;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Local Dhaka parts of an instant. */
export function toLocal(date: Date): LocalParts {
  const shifted = new Date(date.getTime() + DHAKA_OFFSET_MIN * MIN_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  return {
    isoDate: `${year}-${pad(month)}-${pad(day)}`,
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    year,
    month,
    day,
  };
}

/** Instant for a Dhaka local date and minutes since midnight. */
export function fromLocal(isoDate: string, minutes: number): Date {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + (minutes - DHAKA_OFFSET_MIN) * MIN_MS);
}

/** "2026-11-08T18:00:00+06:00" (contract slot format). */
export function toDhakaIso(date: Date): string {
  const l = toLocal(date);
  return `${l.isoDate}T${pad(Math.floor(l.minutes / 60))}:${pad(l.minutes % 60)}:00+06:00`;
}

/** Weekday (0 = Sunday) of a "YYYY-MM-DD" date. */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** "HH:MM" to minutes since midnight. */
export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

export function minToHhmm(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
