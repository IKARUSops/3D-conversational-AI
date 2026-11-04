/**
 * Pure formatting and query helpers for the portal (unit tested in format.test.ts).
 * Times are always shown in Asia/Dhaka (UTC+6, no daylight saving).
 */
import type { CallsListQuery } from "@/contracts";

export const DHAKA_TZ = "Asia/Dhaka";
export const PAGE_SIZE = 25;

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** NFC normalise and turn Bangla digits into ASCII digits (CLAUDE.md rule 5). */
export function normalizeSearch(input: string): string {
  return input
    .normalize("NFC")
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .trim();
}

/** FR-D2: phone masked except the last 4 digits, for example "+880 ••••••1234". */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "Not given";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  const last4 = digits.slice(-4);
  return phone.startsWith("+880") ? `+880 ••••••${last4}` : `••••••${last4}`;
}

/** Seconds to "m:ss" (or "h:mm:ss"). Null shows a hyphen placeholder. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "-";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Milliseconds from call start to "mm:ss" (FR-D6). */
export function mmss(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "--:--";
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: DHAKA_TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: DHAKA_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});
const weekdayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: DHAKA_TZ, weekday: "short" });

export function formatDate(d: Date | null | undefined): string {
  return d ? dateFmt.format(d) : "-";
}
export function formatTime(d: Date | null | undefined): string {
  return d ? timeFmt.format(d).toUpperCase() : "-";
}
export function formatDateTime(d: Date | null | undefined): string {
  return d ? `${weekdayFmt.format(d)} ${formatDate(d)}, ${formatTime(d)}` : "-";
}

/** "YYYY-MM-DD" of a date in Dhaka. */
export function dhakaDateKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA gives YYYY-MM-DD
}

/** Start of a Dhaka calendar day (YYYY-MM-DD) as a UTC Date. */
export function dhakaDayStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+06:00`);
}

/** Start of the next Dhaka day: use as an exclusive upper bound. */
export function dhakaNextDayStart(dateKey: string): Date {
  return new Date(dhakaDayStart(dateKey).getTime() + 24 * 3600 * 1000);
}

/** Parse searchParams into the CallsListQuery shape, dropping invalid values. */
export function readSearchParams(
  sp: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value != null && value !== "") out[k] = value;
  }
  return out;
}

/**
 * Prisma `where` for the calls list (FR-D3). Kept as a plain object so it is easy to test.
 * Search matches patient or extracted names (Bangla or English) and phone digits.
 */
export function buildCallsWhere(clinicId: string, q: CallsListQuery): Record<string, unknown> {
  const and: Record<string, unknown>[] = [{ clinicId }];
  if (q.status) and.push({ status: q.status });
  if (q.stt) and.push({ sttProvider: q.stt });
  if (q.tts) and.push({ ttsProvider: q.tts });
  if (q.from || q.to) {
    const range: Record<string, Date> = {};
    if (q.from) range.gte = dhakaDayStart(q.from);
    if (q.to) range.lt = dhakaNextDayStart(q.to);
    and.push({ startedAt: range });
  }
  if (q.q) {
    const text = normalizeSearch(q.q);
    const digits = text.replace(/\D/g, "");
    const or: Record<string, unknown>[] = [
      { patient: { fullNameBn: { contains: text, mode: "insensitive" } } },
      { patient: { fullNameEn: { contains: text, mode: "insensitive" } } },
      { extraction: { patientNameBn: { contains: text, mode: "insensitive" } } },
      { extraction: { patientNameEn: { contains: text, mode: "insensitive" } } },
    ];
    if (digits.length >= 3) {
      // Local "017..." numbers are stored as "+88017...": drop a leading 0 or 880 prefix.
      const core = digits.replace(/^880?/, "").replace(/^0/, "");
      or.push(
        { patient: { phoneE164: { contains: core } } },
        { extraction: { phoneE164: { contains: core } } },
        { extraction: { phoneRaw: { contains: digits } } },
      );
    }
    and.push({ OR: or });
  }
  return { AND: and };
}

/** Builds a query string from current params with overrides (null removes a key). */
export function withParams(
  current: Record<string, string>,
  overrides: Record<string, string | number | null>,
): string {
  const params = new URLSearchParams(current);
  for (const [k, v] of Object.entries(overrides)) {
    if (v == null || v === "") params.delete(k);
    else params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Human labels for enum values shown in the portal. */
export const PROVIDER_LABEL: Record<string, string> = {
  browser: "Browser",
  elevenlabs: "ElevenLabs",
  openai: "OpenAI",
  azure: "Azure",
};

export function titleCase(value: string | null | undefined): string {
  if (!value) return "-";
  const s = value.replace(/_/g, " ");
  return s[0]!.toUpperCase() + s.slice(1);
}
