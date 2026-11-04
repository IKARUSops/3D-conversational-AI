/**
 * Make any agent sentence speakable (SRS 2 section 7.5, FR-C22).
 * `text` stays readable (digits) for captions; `ttsNormalize(text)` is sent to TTS.
 */
import type { CallLang } from "@/contracts";
import { BN_0_99, numberToBn, timeToBn } from "./bangla-numbers";
import { bnDigitsToAscii, collapseSpaces, nfc } from "./normalize";
import { spokenDigitsBn } from "./phone";

const n = (s: string) => s.normalize("NFC");

const DAY_PART_WORDS = ["সকাল", "দুপুর", "বিকাল", "বিকেল", "সন্ধ্যা", "রাত", "ভোর"].map(n);

/** Remove markdown, emojis and characters TTS reads badly. */
export function stripMarkdownAndEmoji(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url)
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|\s)[*_](\S[^*_]*)[*_](?=\s|$|[।,?!.])/g, "$1$2")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*#_~>|]/g, " ")
    .replace(/\p{Extended_Pictographic}|️|‍(?=\p{Extended_Pictographic})/gu, "");
}

/** Replace title abbreviations: "ডা." / "Dr." to "ডাক্তার". */
function expandTitles(s: string): string {
  return s.replace(new RegExp(`${n("ডা")}\\.\\s*`, "g"), n("ডাক্তার ")).replace(/\bDr\.?\s+/gi, n("ডাক্তার "));
}

/** Bangladeshi phone numbers (with +88, spaces or dashes) to spoken digits. */
function speakPhones(s: string): string {
  return s.replace(/(?:\+?88[\s-]?)?0\s?1[3-9](?:[\s-]?\d){8}\b/g, (m) => {
    const digits = m.replace(/\D/g, "").replace(/^88/, "");
    return spokenDigitsBn(digits);
  });
}

/** HH:MM to Bangla time words. Skips the day part if the previous word already is one. */
function speakClockTimes(s: string): string {
  return s.replace(/(\S+\s+)?\b([01]?\d|2[0-3]):([0-5]\d)\b(\s*(?:am|pm|a\.m\.|p\.m\.))?/gi, (m, prev: string | undefined, hh: string, mm: string, ampm?: string) => {
    let h = Number(hh);
    const min = Number(mm);
    if (ampm) {
      const pm = /p/i.test(ampm);
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    const prevWord = (prev ?? "").trim();
    const hasPart = DAY_PART_WORDS.some((w) => prevWord.startsWith(w));
    return `${prev ?? ""}${timeToBn(h, min, { withDayPart: !hasPart })}`;
  });
}

/** "৬টা", "10টায়" to "ছয়টা", "দশটায়". */
function speakHourSuffix(s: string): string {
  return s.replace(new RegExp(`\\b(\\d{1,2})\\s?(${n("টা")}[^\\s,।?!]*)`, "g"), (m, d: string, suf: string) => {
    const v = Number(d);
    return v <= 99 ? `${BN_0_99[v]}${suf}` : m;
  });
}

/** Remaining numbers: 1,500 to words; long digit runs (6+) read digit by digit. */
function speakNumbers(s: string): string {
  return s
    .replace(/(\d+)\.(\d+)/g, (_m, a: string, b: string) => `${numberToBn(Number(a))} ${n("দশমিক")} ${spokenDigitsBn(b, " ")}`)
    .replace(/\d{1,3}(?:,\d{2,3})+/g, (m) => m.replace(/,/g, ""))
    .replace(/৳\s?(\d+)/g, (_m, d: string) => `${d} ${n("টাকা")}`)
    .replace(/(\d+)\s?%/g, (_m, d: string) => `${d} ${n("শতাংশ")}`)
    .replace(/\d+/g, (d) => (d.length >= 6 ? spokenDigitsBn(d, " ") : numberToBn(Number(d))));
}

/**
 * Speakable form of an agent sentence. For Bangla: phones, clock times, "Xটা", money, numbers
 * become Bangla words. For English: only markdown/emoji cleanup and "Dr." stays as is.
 */
export function ttsNormalize(text: string, lang: CallLang = "bn"): string {
  let s = stripMarkdownAndEmoji(nfc(text));
  if (lang === "en") return collapseSpaces(s);
  s = bnDigitsToAscii(s);
  s = expandTitles(s);
  s = speakPhones(s);
  s = speakClockTimes(s);
  s = speakHourSuffix(s);
  s = speakNumbers(s);
  return collapseSpaces(nfc(s));
}

/** Readable caption text: markdown and emoji removed, nothing else changed. */
export function captionText(text: string): string {
  return collapseSpaces(stripMarkdownAndEmoji(nfc(text)));
}
