/**
 * Bangladeshi mobile numbers (SRS 2 section 7.5, FR-D-VAL).
 * Owner decision: the LLM turns spoken words into digits; code only cleans and checks.
 */
import type { PhoneProblem } from "@/contracts";
import { bnDigitsToAscii, nfc } from "./normalize";

const DIGIT_WORDS_BN = ["শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়"].map(
  (w) => w.normalize("NFC"),
);

/** NFC, Bangla digits to ASCII, drop spaces/dashes/dots/brackets/plus, strip a leading 88(0). */
export function cleanPhone(s: string): string {
  let d = bnDigitsToAscii(nfc(s)).replace(/[\s\-–.()[\]{}+‌‍]/g, "");
  if (/^880\d+$/.test(d)) d = d.slice(2);
  else if (/^00880\d+$/.test(d)) d = d.slice(4);
  return d;
}

export const BD_MOBILE_RE = /^01[3-9]\d{8}$/;

export interface PhoneCheck {
  valid: boolean;
  /** Cleaned digits. */
  digits: string;
  problems: PhoneProblem[];
}

/** Validate an already cleaned (or raw) number against `^01[3-9]\d{8}$`. */
export function validateBdMobile(input: string): PhoneCheck {
  const digits = cleanPhone(input);
  const problems: PhoneProblem[] = [];
  if (digits.length === 0) problems.push("empty");
  else if (!/^\d+$/.test(digits)) problems.push("not_digits");
  else if (digits.length < 11) problems.push("too_short");
  else if (digits.length > 11) problems.push("too_long");
  else if (!BD_MOBILE_RE.test(digits)) problems.push("bad_prefix");
  return { valid: problems.length === 0, digits, problems };
}

/** "01712345678" to "+8801712345678". Throws on invalid input. */
export function toE164(digits: string): string {
  const d = cleanPhone(digits);
  if (!BD_MOBILE_RE.test(d)) throw new Error("Not a valid Bangladeshi mobile number");
  return `+88${d}`;
}

/** Digit-by-digit Bangla words with commas so TTS pauses: "শূন্য, এক, সাত, ...". */
export function spokenDigitsBn(digits: string, separator = ", "): string {
  return bnDigitsToAscii(digits)
    .replace(/\D/g, "")
    .split("")
    .map((d) => DIGIT_WORDS_BN[Number(d)])
    .join(separator);
}

/** Last 4 digits for privacy-friendly read-backs. */
export function phoneLast4(digits: string): string {
  return cleanPhone(digits).slice(-4);
}
