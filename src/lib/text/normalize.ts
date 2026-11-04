/**
 * Basic text normalisation (SRS 2 section 7.5, CLAUDE.md rule 5).
 *
 * Note on NFC and Bangla: য় (U+09DF), ড় (U+09DC) and ঢ় (U+09DD) are Unicode composition
 * exclusions. NFC turns them into base letter + nukta (U+09BC). So we always compare
 * NFC text with NFC patterns (see `nfc` and `nfcAll`).
 */

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** Unicode NFC. Safe on any input. */
export function nfc(s: string): string {
  return (s ?? "").normalize("NFC");
}

/** NFC every string in a list (for keyword tables written in source code). */
export function nfcAll<T extends readonly string[]>(list: T): string[] {
  return list.map((s) => s.normalize("NFC"));
}

/** Bangla digits ০-৯ to ASCII 0-9. Other characters are kept. */
export function bnDigitsToAscii(s: string): string {
  return (s ?? "").replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

/** ASCII digits to Bangla digits (for display). */
export function asciiDigitsToBn(s: string): string {
  return (s ?? "").replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]!);
}

/** Collapse runs of whitespace to one space and trim. */
export function collapseSpaces(s: string): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** NFC + ASCII digits + lower case + single spaces: the form all parsers work on. */
export function normalizeForMatch(s: string): string {
  return collapseSpaces(bnDigitsToAscii(nfc(s)).toLowerCase());
}
