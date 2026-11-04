/** Shared helpers for the hero 3D components (SRS 3 section 4). Client only. */
import type { MascotState } from "@/components/landing/MascotBridge";

export type { MascotState };

export const MIN_STATE_MS = 400;
export const THINKING_DELAY_MS = 300;

/** Reads a design token (CSS variable) so 3D colours follow docs/DESIGN.md. */
export function cssToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Debounces state changes for the mascot: each shown state lasts at least MIN_STATE_MS and
 * "thinking" is only shown when the wait is longer than THINKING_DELAY_MS. Pure, testable.
 */
export class StateGate {
  shown: MascotState;
  private shownAt: number;
  private wanted: MascotState;
  private wantedAt: number;

  constructor(initial: MascotState = "idle", now = 0) {
    this.shown = initial;
    this.wanted = initial;
    this.shownAt = now;
    this.wantedAt = now;
  }

  /** Returns the state to show at time `now` (ms). */
  update(wanted: MascotState, now: number): MascotState {
    if (wanted !== this.wanted) {
      this.wanted = wanted;
      this.wantedAt = now;
    }
    if (this.wanted === this.shown) return this.shown;
    if (now - this.shownAt < MIN_STATE_MS) return this.shown;
    if (this.wanted === "thinking" && now - this.wantedAt < THINKING_DELAY_MS) return this.shown;
    this.shown = this.wanted;
    this.shownAt = now;
    return this.shown;
  }
}

/** Draws the laptop screen: gold waveform, idle line, or thinking dots. */
export function drawScreen(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: MascotState,
  history: number[],
  t: number,
  colors: { bg: string; line: string; dim: string },
): void {
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);
  const mid = h / 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (state === "thinking") {
    for (let i = 0; i < 3; i++) {
      const phase = t * 4 - i * 0.6;
      const y = mid - Math.max(0, Math.sin(phase)) * h * 0.12;
      ctx.fillStyle = colors.line;
      ctx.beginPath();
      ctx.arc(w / 2 + (i - 1) * w * 0.12, y, h * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (state === "listening" || state === "speaking") {
    // Bars from the level history (newest on the right), mirrored around the middle.
    const n = history.length;
    const bw = w / n;
    ctx.fillStyle = colors.line;
    for (let i = 0; i < n; i++) {
      const lv = Math.max(0.03, Math.min(1, history[i] ?? 0));
      const bh = lv * h * 0.8;
      ctx.globalAlpha = 0.35 + 0.65 * (i / n);
      ctx.fillRect(i * bw + bw * 0.2, mid - bh / 2, bw * 0.6, bh);
    }
    ctx.globalAlpha = 1;
    return;
  }

  // idle: slow gentle line
  ctx.strokeStyle = colors.dim;
  ctx.lineWidth = h * 0.025;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 6) {
    const y =
      mid + Math.sin((x / w) * Math.PI * 4 + t * 1.5) * h * 0.05 * Math.sin(t * 0.7 + (x / w) * 2);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** Scene lighting (not UI colours): warm key light, cool rim, navy ground bounce. */
export const LIGHT = {
  sky: "#fff6e0",
  ground: "#0b1b3f",
  key: "#fff3d6",
  rim: "#9cc1ff",
} as const;
