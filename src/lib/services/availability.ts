/**
 * Availability (SRS 2 section 7.6, FR-C9, FR-C19).
 *
 * `computeSlots` is pure (all inputs passed in) and fully unit-tested.
 * `checkAvailability` is the thin DB wrapper used by the agent tool.
 *
 * Rules:
 * - Slots every `slotMinutes` from clinic open, inside doctor schedule AND clinic hours.
 * - No slots on closed weekdays (Friday), in the prayer break, in the past + lead time,
 *   or where the doctor already has an active (booked / rescheduled) appointment.
 * - Service to specialty: braces_consultation -> orthodontist only; root_canal / extraction ->
 *   oral surgeon first, general dentist when no surgeon slot that day; others -> general.
 * - Up to 3 slots closest to the requested time / part of day on the requested date; if none,
 *   up to 3 across the following 3 open days (`movedToLaterDays: true`).
 */
import type {
  CheckAvailabilityInput,
  CheckAvailabilityOutput,
  DatetimeProblem,
  PartOfDay,
  ServiceCode,
  SlotOffer,
  Specialty,
} from "@/contracts";
import type { ClinicContext } from "@/lib/services";
import { spokenDateTimeBn } from "./spoken-bn";
import { addDays, fromLocal, hhmmToMin, toDhakaIso, toLocal, weekdayOf } from "./time";

export type ClinicDoctor = ClinicContext["doctors"][number];

/** An active appointment that blocks a doctor slot. */
export interface BusySlot {
  doctorId: string;
  start: Date;
}

export interface ComputeSlotsInput {
  clinic: ClinicContext;
  isoDate: string;
  partOfDay?: PartOfDay;
  time?: string;
  serviceCode?: ServiceCode;
  doctorPreference?: string;
  busy: BusySlot[];
  now: Date;
  /** Max slots to return (default 3). */
  max?: number;
}

/** Part-of-day windows in local minutes [start, end) (SRS 2 section 7.5). */
export const PART_OF_DAY_WINDOWS: Record<PartOfDay, [number, number]> = {
  morning: [10 * 60, 12 * 60],
  noon: [12 * 60, 13 * 60 + 30],
  afternoon: [14 * 60 + 30, 17 * 60],
  evening: [17 * 60, 19 * 60 + 30],
  night: [19 * 60 + 30, 24 * 60],
};

/** How many open days to search after a full requested day. */
export const LATER_OPEN_DAYS = 3;

interface Candidate {
  doctor: ClinicDoctor;
  start: Date;
  /** Local minutes since midnight. */
  minutes: number;
  isoDate: string;
}

/** Specialty groups to try, in order, for a service (first group with slots wins per day). */
export function specialtyGroups(serviceCode?: ServiceCode): Specialty[][] {
  switch (serviceCode) {
    case "braces_consultation":
      return [["orthodontist"]];
    case "root_canal":
    case "extraction":
      return [["oral_surgeon"], ["general"]];
    default:
      return [["general"]];
  }
}

const norm = (s: string): string =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s.]+/g, " ")
    .trim();

/** Doctor named by the caller (id, code or a name part), or undefined. */
export function matchDoctor(doctors: ClinicDoctor[], pref?: string): ClinicDoctor | undefined {
  if (!pref) return undefined;
  const p = norm(pref).replace(/^(ডা|ডাক্তার|dr|doctor) /, "");
  if (!p) return undefined;
  return doctors.find(
    (d) =>
      d.id === pref ||
      d.code === pref ||
      norm(d.nameEn).includes(p) ||
      norm(d.nameBn).includes(p) ||
      p.includes(norm(d.nameEn).replace(/^dr /, "")) ||
      p.includes(norm(d.nameBn).replace(/^ডা /, "")),
  );
}

/** Doctor groups to try for a request: preferred doctor (when allowed) or specialty groups. */
export function doctorGroups(
  doctors: ClinicDoctor[],
  serviceCode?: ServiceCode,
  doctorPreference?: string,
): ClinicDoctor[][] {
  const groups = specialtyGroups(serviceCode);
  const preferred = matchDoctor(doctors, doctorPreference);
  // Braces needs an orthodontist; any other service may go to the doctor the caller named.
  if (
    preferred &&
    (serviceCode !== "braces_consultation" || preferred.specialty === "orthodontist")
  ) {
    return [[preferred]];
  }
  return groups.map((specs) => doctors.filter((d) => specs.includes(d.specialty as Specialty)));
}

/** True when the clinic is open on that date (not Friday or another closed weekday). */
export function isOpenDay(clinic: ClinicContext, isoDate: string): boolean {
  return clinic.settings.openWeekdays.includes(weekdayOf(isoDate));
}

/** All free slots of one doctor on one date. */
export function doctorDaySlots(
  clinic: ClinicContext,
  doctor: ClinicDoctor,
  isoDate: string,
  busy: BusySlot[],
  now: Date,
): Candidate[] {
  if (!isOpenDay(clinic, isoDate)) return [];
  const s = clinic.settings;
  const step = s.slotMinutes;
  const open = hhmmToMin(s.open);
  const close = hhmmToMin(s.close);
  const prayerStart = hhmmToMin(s.prayerBreak.start);
  const prayerEnd = hhmmToMin(s.prayerBreak.end);
  const earliest = now.getTime() + s.leadMinutes * 60_000;
  const weekday = weekdayOf(isoDate);
  const busyKeys = new Set(busy.map((b) => `${b.doctorId}|${b.start.getTime()}`));

  const out: Candidate[] = [];
  const seen = new Set<number>();
  for (const sch of doctor.schedule.filter((x) => x.weekday === weekday)) {
    const from = Math.max(open, hhmmToMin(sch.start));
    const to = Math.min(close, hhmmToMin(sch.end));
    // Align to the clinic slot grid.
    let m = open + Math.ceil((from - open) / step) * step;
    for (; m + step <= to; m += step) {
      if (m < prayerEnd && m + step > prayerStart) continue;
      if (seen.has(m)) continue;
      const start = fromLocal(isoDate, m);
      if (start.getTime() < earliest) continue;
      if (busyKeys.has(`${doctor.id}|${start.getTime()}`)) continue;
      seen.add(m);
      out.push({ doctor, start, minutes: m, isoDate });
    }
  }
  return out;
}

/** Free slots on a date for the first doctor group that has any. */
function daySlots(
  clinic: ClinicContext,
  groups: ClinicDoctor[][],
  isoDate: string,
  busy: BusySlot[],
  now: Date,
): Candidate[] {
  for (const group of groups) {
    const slots = group.flatMap((d) => doctorDaySlots(clinic, d, isoDate, busy, now));
    if (slots.length > 0) return slots;
  }
  return [];
}

/** Distance in minutes from a slot to the requested time or window (0 = perfect). */
function distance(minutes: number, partOfDay?: PartOfDay, time?: string): number {
  if (time) return Math.abs(minutes - hhmmToMin(time));
  if (partOfDay) {
    const [a, b] = PART_OF_DAY_WINDOWS[partOfDay];
    if (minutes < a) return a - minutes;
    if (minutes >= b) return minutes - b + 1;
    return 0;
  }
  return 0;
}

/** Sort by closeness, then time; keep one doctor per start time (first doctor in order). */
function rank(cands: Candidate[], partOfDay?: PartOfDay, time?: string): Candidate[] {
  const sorted = [...cands].sort(
    (x, y) =>
      distance(x.minutes, partOfDay, time) - distance(y.minutes, partOfDay, time) ||
      x.start.getTime() - y.start.getTime(),
  );
  const seen = new Set<number>();
  return sorted.filter((c) => {
    const k = c.start.getTime();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function toOffer(c: Candidate): SlotOffer {
  return {
    start: toDhakaIso(c.start),
    doctorId: c.doctor.id,
    doctorNameBn: c.doctor.nameBn,
    spokenBn: `${spokenDateTimeBn(c.start)}, ${c.doctor.nameBn}`,
  };
}

/** Problems with the requested date itself (the output still offers alternatives). */
export function dateProblems(clinic: ClinicContext, isoDate: string, now: Date): DatetimeProblem[] {
  const problems: DatetimeProblem[] = [];
  if (isoDate < toLocal(now).isoDate) problems.push("in_past");
  else if (!isOpenDay(clinic, isoDate)) problems.push("closed_friday");
  return problems;
}

/** Pure slot finder (SRS 2 section 7.6). */
export function computeSlots(input: ComputeSlotsInput): CheckAvailabilityOutput {
  const { clinic, partOfDay, time, busy, now } = input;
  const max = input.max ?? 3;
  const doctors = clinic.doctors;
  const groups = doctorGroups(doctors, input.serviceCode, input.doctorPreference);
  const problems = dateProblems(clinic, input.isoDate, now);
  const today = toLocal(now).isoDate;
  const requested = input.isoDate < today ? today : input.isoDate;

  if (!problems.includes("in_past")) {
    const same = rank(daySlots(clinic, groups, requested, busy, now), partOfDay, time);
    if (same.length > 0 && problems.length === 0) {
      return { slots: same.slice(0, max).map(toOffer) };
    }
  }

  // Following open days: best slot per day first, then fill with second-best ones.
  const perDay: Candidate[][] = [];
  let day = problems.includes("in_past") ? addDays(today, -1) : requested;
  for (let i = 0; i < 21 && perDay.length < LATER_OPEN_DAYS; i++) {
    day = addDays(day, 1);
    if (!isOpenDay(clinic, day)) continue;
    perDay.push(rank(daySlots(clinic, groups, day, busy, now), partOfDay, time));
  }
  const picked: Candidate[] = [];
  for (let round = 0; picked.length < max && round < 48; round++) {
    let added = false;
    for (const list of perDay) {
      const c = list[round];
      if (c && picked.length < max) {
        picked.push(c);
        added = true;
      }
    }
    if (!added) break;
  }
  picked.sort((a, b) => a.start.getTime() - b.start.getTime());
  return {
    slots: picked.map(toOffer),
    movedToLaterDays: true,
    ...(problems.length > 0 ? { problems } : {}),
  };
}

/** Is this exact slot bookable for this doctor right now (ignoring the DB busy check)? */
export function isValidSlot(
  clinic: ClinicContext,
  doctorId: string,
  start: Date,
  now: Date,
  busy: BusySlot[] = [],
): boolean {
  const doctor = clinic.doctors.find((d) => d.id === doctorId);
  if (!doctor) return false;
  const l = toLocal(start);
  return doctorDaySlots(clinic, doctor, l.isoDate, busy, now).some(
    (c) => c.start.getTime() === start.getTime(),
  );
}

/** Range of instants the busy query must cover for a request. */
export function busyQueryRange(isoDate: string, now: Date): { from: Date; to: Date } {
  const today = toLocal(now).isoDate;
  const startDay = isoDate < today ? today : isoDate;
  return { from: fromLocal(startDay, 0), to: fromLocal(addDays(startDay, 22), 0) };
}

export type { CheckAvailabilityInput };
