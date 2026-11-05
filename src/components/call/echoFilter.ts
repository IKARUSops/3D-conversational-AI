/**
 * Echo filter for barge-in (SRS 2 section 8.4, FR-C17, owner decision O-09).
 * Caller text is accepted only if it has 2+ words and less than 60% of its words appear in
 * what the agent is saying now (both the readable text and the spoken ttsText).
 */
import { normalizeForMatch } from "@/lib/text/normalize";

export const ECHO_MIN_WORDS = 2;
export const ECHO_MAX_OVERLAP = 0.6;

export function tokens(s: string): string[] {
  return normalizeForMatch(s)
    .replace(/[।,.?!;:"'()\-–]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export type EchoDecision =
  | { accept: true; overlap: number }
  | { accept: false; reason: "too_short" | "echo"; overlap: number };

export function echoCheck(callerText: string, agentTexts: string[]): EchoDecision {
  const words = tokens(callerText);
  if (words.length < ECHO_MIN_WORDS) return { accept: false, reason: "too_short", overlap: 0 };
  const agent = new Set(agentTexts.flatMap(tokens));
  if (agent.size === 0) return { accept: true, overlap: 0 };
  const hits = words.filter((w) => agent.has(w)).length;
  const overlap = hits / words.length;
  return overlap >= ECHO_MAX_OVERLAP ? { accept: false, reason: "echo", overlap } : { accept: true, overlap };
}

/**
 * Short answers to a yes/no question ("ঠিক আছে", "হ্যাঁ", "জি", "না", "yes"). They often repeat
 * the agent's own words ("..., ঠিক আছে?"), so the echo check would drop them (TC-06).
 */
const ANSWER_WORDS = new Set(
  [
    "হ্যাঁ", "হ্যা", "হাঁ", "জি", "জ্বি", "জী", "ঠিক", "আছে", "না", "নাহ", "আচ্ছা", "ওকে", "ঠিকাছে",
    "সঠিক", "ভুল", "করেন", "করুন", "দেন", "বুক", "yes", "yeah", "ok", "okay", "no", "right", "correct", "sure",
  ].map((w) => w.normalize("NFC").toLowerCase()),
);

export function isShortAnswer(callerText: string): boolean {
  const words = tokens(callerText);
  return words.length > 0 && words.length <= 4 && words.every((w) => ANSWER_WORDS.has(w));
}
