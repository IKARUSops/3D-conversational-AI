/**
 * Sentence splitter for streamed LLM text (SRS 2 section 7.1 step 7).
 * Ends a sentence at । ? ! and newline at once, and at "." only when it is followed by
 * whitespace and is not a decimal point or a known abbreviation (ডা., Dr., Mr. ...).
 */
const ABBREVIATIONS = ["ডা", "dr", "mr", "mrs", "ms", "prof", "st", "no", "e.g", "i.e", "vs"].map(
  (s) => s.normalize("NFC"),
);

/** Very short pieces ("জি।") are joined to the next sentence to save TTS requests. */
const MIN_SENTENCE_CHARS = 4;

function isHardTerminator(ch: string): boolean {
  return ch === "।" || ch === "?" || ch === "!" || ch === "\n" || ch === "॥";
}

function endsWithAbbreviation(text: string): boolean {
  const m = /([\p{L}\p{M}.]+)$/u.exec(text);
  if (!m) return false;
  const word = m[1]!.toLowerCase();
  return ABBREVIATIONS.includes(word);
}

export class SentenceSplitter {
  private buf = "";

  /** Add streamed text; returns the sentences that are now complete. */
  push(delta: string): string[] {
    this.buf += delta;
    const out: string[] = [];
    let start = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const ch = this.buf[i]!;
      let cut = -1;
      if (isHardTerminator(ch)) {
        // Keep runs like "?!" or "।\n" together.
        let j = i + 1;
        while (j < this.buf.length && (isHardTerminator(this.buf[j]!) || this.buf[j] === ".")) j++;
        // A terminator at the very end is cut at once: waiting for more text costs latency.
        cut = j;
      } else if (ch === ".") {
        if (i + 1 >= this.buf.length) break; // need one more char to decide
        let j = i;
        while (j < this.buf.length && this.buf[j] === ".") j++;
        if (j >= this.buf.length) break;
        const next = this.buf[j]!;
        const prev = this.buf.slice(start, i);
        const isDecimal = /\d$/.test(prev) && /\d/.test(next);
        if (!isDecimal && /\s/.test(next) && !(j === i + 1 && endsWithAbbreviation(prev))) {
          cut = j;
        }
      }
      if (cut > 0) {
        const piece = this.buf.slice(start, cut).trim();
        if (piece.length >= MIN_SENTENCE_CHARS) {
          out.push(piece);
          start = cut;
        } else if (piece.length === 0) {
          start = cut;
        }
        i = cut - 1;
      }
    }
    this.buf = this.buf.slice(start);
    return out;
  }

  /** Remaining text at the end of the stream (may be empty). */
  flush(): string[] {
    const rest = this.buf.trim();
    this.buf = "";
    return rest ? [rest] : [];
  }
}

/** Split a complete text into sentences. */
export function splitSentences(text: string): string[] {
  const s = new SentenceSplitter();
  return [...s.push(text), ...s.flush()];
}
