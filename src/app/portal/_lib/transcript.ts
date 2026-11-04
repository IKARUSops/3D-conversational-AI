/**
 * Merges transcript turns with tool and interruption markers into one ordered list (FR-D6).
 * Turns carry startedMs (from call start); events carry an absolute timestamp.
 */
export interface TurnLike {
  id: string;
  seq: number;
  speaker: "agent" | "caller" | "system";
  textBn: string;
  textEn: string | null;
  startedMs: number | null;
  interrupted: boolean;
  inputMode: "voice" | "typed" | null;
}

export interface EventLike {
  id: string;
  ts: Date;
  type: string;
  payload: unknown;
}

export type TranscriptItem =
  | { kind: "turn"; atMs: number | null; turn: TurnLike }
  | { kind: "marker"; atMs: number; id: string; type: string; label: string; ok?: boolean };

const MARKER_TYPES = new Set([
  "tool_call",
  "tool_result",
  "interruption",
  "silence_prompt",
  "provider_fallback",
]);

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function markerLabel(type: string, payload: unknown): { label: string; ok?: boolean } {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const name = str(p.name)?.replace(/_/g, " ");
  switch (type) {
    case "tool_call":
      return { label: `Tool: ${name ?? "unknown"}` };
    case "tool_result":
      return {
        label: `Result: ${name ?? "tool"}${p.ok === false ? " (failed)" : ""}`,
        ok: p.ok !== false,
      };
    case "interruption":
      return { label: "Caller interrupted" };
    case "silence_prompt":
      return { label: "Silence prompt" };
    case "provider_fallback":
      return {
        label: `Fallback ${str(p.kind) ?? ""}: ${str(p.from) ?? "?"} → ${str(p.to) ?? "?"}`.replace(
          "  ",
          " ",
        ),
        ok: false,
      };
    default:
      return { label: type.replace(/_/g, " ") };
  }
}

export function buildTranscriptItems(
  turns: TurnLike[],
  events: EventLike[],
  callStartedAt: Date,
  options: { includeResults?: boolean } = {},
): TranscriptItem[] {
  const items: TranscriptItem[] = turns.map((t) => ({ kind: "turn", atMs: t.startedMs, turn: t }));
  for (const e of events) {
    if (!MARKER_TYPES.has(e.type)) continue;
    if (e.type === "tool_result" && !options.includeResults) continue;
    const atMs = Math.max(0, e.ts.getTime() - callStartedAt.getTime());
    items.push({ kind: "marker", atMs, id: e.id, type: e.type, ...markerLabel(e.type, e.payload) });
  }
  // Stable sort: turns without a time keep their seq order; markers slot in by time.
  const seqOrder = new Map(turns.map((t, i) => [t.id, i]));
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ta = a.item.atMs;
      const tb = b.item.atMs;
      if (ta != null && tb != null && ta !== tb) return ta - tb;
      if (a.item.kind === "turn" && b.item.kind === "turn") {
        return (seqOrder.get(a.item.turn.id) ?? 0) - (seqOrder.get(b.item.turn.id) ?? 0);
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);
}
