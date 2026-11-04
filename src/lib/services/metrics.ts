/** Finalize step 2: call metrics from call_events (CallMetrics in contracts). Pure. */
import type { CallMetrics } from "@/contracts";

type Stat = { median: number | null; p90: number | null };

/** Nearest-rank percentile on a copy; null for an empty list. */
export function percentile(values: number[], p: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const idx = Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1));
  return v[idx] ?? null;
}

const stat = (values: number[]): Stat => ({
  median: percentile(values, 50),
  p90: percentile(values, 90),
});

const num = (o: Record<string, unknown>, k: string): number | undefined =>
  typeof o[k] === "number" ? (o[k] as number) : undefined;

export function computeMetrics(
  events: Array<{ type: string; payload: unknown }>,
  input: { turns: number; interruptedTurns: number; silencePrompts: number },
): CallMetrics {
  const firstToken: number[] = [];
  const firstAudio: number[] = [];
  const stt: number[] = [];
  let interruptions = 0;
  let fallbacks = 0;
  for (const e of events) {
    const p =
      e.payload && typeof e.payload === "object" ? (e.payload as Record<string, unknown>) : {};
    if (e.type === "turn_latency") {
      const ft = num(p, "firstTokenMs");
      const fa = num(p, "firstAudioMs");
      const s = num(p, "sttMs");
      if (ft !== undefined) firstToken.push(ft);
      if (fa !== undefined) firstAudio.push(fa);
      if (s !== undefined) stt.push(s);
    } else if (e.type === "interruption") interruptions++;
    else if (e.type === "provider_fallback") fallbacks++;
  }
  return {
    turns: input.turns,
    interruptions: Math.max(interruptions, input.interruptedTurns),
    silencePrompts: input.silencePrompts,
    providerFallbacks: fallbacks,
    latencyMs: {
      firstToken: stat(firstToken),
      firstAudio: stat(firstAudio),
      ...(stt.length > 0 ? { stt: stat(stt) } : {}),
    },
  };
}
