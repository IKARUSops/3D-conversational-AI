/**
 * SSE wire format for POST /api/calls/:id/turn (SRS 2 section 5.2):
 * one JSON object per `data:` line, each event followed by a blank line.
 * Pure functions: the encoder runs on the server, the parser in the browser (fetch + getReader).
 */
import type { TurnEvent } from "@/contracts";

export function encodeSse(event: TurnEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Incremental parser: feed decoded text chunks, get complete events. */
export class SseParser {
  private buf = "";

  push(chunk: string): TurnEvent[] {
    this.buf += chunk.replace(/\r\n/g, "\n");
    const out: TurnEvent[] = [];
    let idx: number;
    while ((idx = this.buf.indexOf("\n\n")) >= 0) {
      const block = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 2);
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!data) continue;
      try {
        out.push(JSON.parse(data) as TurnEvent);
      } catch {
        // ignore a broken event
      }
    }
    return out;
  }
}

/** Read an SSE Response body and call `onEvent` for each event. Resolves at stream end. */
export async function readSse(body: ReadableStream<Uint8Array>, onEvent: (e: TurnEvent) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const e of parser.push(decoder.decode(value, { stream: true }))) onEvent(e);
  }
  for (const e of parser.push(decoder.decode() + "\n\n")) onEvent(e);
}
