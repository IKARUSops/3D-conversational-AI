/**
 * Pure validation for services and finalize (SRS 1 section 5.2, FR-D-VAL).
 * Agent B has the richer text toolkit in src/lib/text; these are the minimal rules services need.
 */
import type { PhoneProblem } from "@/contracts";

const BN_DIGIT_BASE = 0x09e6;

export function nfc(s: string): string {
  return s.normalize("NFC");
}

/** Bangla digits ০-৯ to ASCII 0-9. */
export function bnDigitsToAscii(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - BN_DIGIT_BASE));
}

export type PhoneCheck =
  | { valid: true; digits: string; e164: string }
  | { valid: false; digits: string; problem: PhoneProblem };

/** NFC, Bangla digits, strip spaces/dashes/brackets/dots/+, strip leading 88, check ^01[3-9]\d{8}$. */
export function checkBdPhone(raw: string | null | undefined): PhoneCheck {
  const cleaned = bnDigitsToAscii(nfc(raw ?? "")).replace(/[\s\-+().]/g, "");
  if (!cleaned) return { valid: false, digits: "", problem: "empty" };
  if (!/^\d+$/.test(cleaned)) return { valid: false, digits: cleaned, problem: "not_digits" };
  const digits = cleaned.startsWith("880") && cleaned.length === 13 ? cleaned.slice(2) : cleaned;
  if (digits.length < 11) return { valid: false, digits, problem: "too_short" };
  if (digits.length > 11) return { valid: false, digits, problem: "too_long" };
  if (!/^01[3-9]\d{8}$/.test(digits)) return { valid: false, digits, problem: "bad_prefix" };
  return { valid: true, digits, e164: `+88${digits}` };
}

/** E.164 or null. */
export function toE164(raw: string | null | undefined): string | null {
  const r = checkBdPhone(raw);
  return r.valid ? r.e164 : null;
}

/** 2 to 60 chars; Bangla or Latin letters (with marks), spaces, dots, hyphens, apostrophes. */
export function isValidName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = nfc(name).trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 60) return false;
  return /^[\p{Script=Bengali}\p{Script=Latin}\p{M}\s.\-']+$/u.test(n) && /[\p{L}]/u.test(n);
}

export function cleanName(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = nfc(name).trim().replace(/\s+/g, " ");
  return n || null;
}
