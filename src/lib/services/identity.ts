/** Pure checks on the caller identity in AgentState before booking-type tools (FR-C15, FR-C18). */
import type { AgentState, BookingError } from "@/contracts";
import { checkBdPhone, cleanName } from "./validate";

export type IdentityResult =
  | { ok: true; e164: string; nameBn: string | null; nameEn: string | null }
  | { ok: false; error: BookingError };

/**
 * Confirmed caller identity from state.
 * - requireName: book and callbacks need a confirmed name; reschedule/cancel need only the phone.
 */
export function callerIdentity(state: AgentState, opts: { requireName: boolean }): IdentityResult {
  const nameBn = cleanName(state.patient?.nameBn);
  const nameEn = cleanName(state.patient?.nameEn);
  if (opts.requireName && !nameBn && !nameEn) return { ok: false, error: "missing_name" };
  const phone = state.phone;
  if (!phone || (!phone.raw && !phone.e164)) return { ok: false, error: "missing_phone" };
  const check = checkBdPhone(phone.e164 ?? phone.raw);
  if (!check.valid) return { ok: false, error: "invalid_phone" };
  if (!phone.confirmed) return { ok: false, error: "need_confirmation" };
  if (opts.requireName && !state.patient?.nameConfirmed)
    return { ok: false, error: "need_confirmation" };
  return { ok: true, e164: check.e164, nameBn, nameEn };
}

/** Prisma / Postgres unique violation (P2002 or SQLSTATE 23505), also through the pg adapter. */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown; meta?: unknown; cause?: unknown };
  if (e.code === "P2002" || e.code === "23505") return true;
  const text = `${typeof e.message === "string" ? e.message : ""} ${safeJson(e.meta)}`;
  if (/23505|UniqueConstraintViolation|unique constraint/i.test(text)) return true;
  return e.cause !== undefined && e.cause !== err ? isUniqueViolation(e.cause) : false;
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return "";
  }
}
