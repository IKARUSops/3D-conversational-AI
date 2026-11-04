/**
 * Shared helpers for provider adapters (SRS 2 section 7.7).
 * Adapters take `fetchImpl` so unit tests can mock the network.
 */

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly status?: number,
  ) {
    super(`${provider}: ${message}`);
    this.name = "ProviderError";
  }
}

/** Model/voice overrides (listed in src/lib/env.ts and .env.example), read lazily with defaults. */
export function providerSetting(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

/** Throws ProviderError with a short safe message (never the key) when !res.ok. */
export async function ensureOk(provider: string, res: Response): Promise<Response> {
  if (res.ok) return res;
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 200);
  } catch {
    // ignore
  }
  throw new ProviderError(provider, `HTTP ${res.status}${detail ? ` ${detail}` : ""}`, res.status);
}

/** AbortSignal that fires when `parent` aborts or after `ms`. Call `clear()` when done. */
export function timeoutSignal(ms: number, parent?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`timeout after ${ms} ms`)), ms);
  const onAbort = () => ctrl.abort(parent?.reason);
  if (parent) {
    if (parent.aborted) ctrl.abort(parent.reason);
    else parent.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    clear: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}

/** Short reason string for logs (no secrets). */
export function errorReason(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 200);
  return String(err).slice(0, 200);
}

/** Escape text for SSML/XML. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Clinic terms that help STT (doctor names, services). */
export const CLINIC_KEYWORDS = [
  "appointment",
  "scaling",
  "filling",
  "root canal",
  "X-ray",
  "braces",
  "serial",
  "নুসরাত জাহান",
  "তানভীর আহমেদ",
  "ফারহানা ইসলাম",
  "ঢাকা ডেন্টাল কেয়ার",
];
