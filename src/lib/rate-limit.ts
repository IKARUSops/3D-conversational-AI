/**
 * DB-based fixed-window rate limits (rate_limits table, FR-B12, SRS 2 section 10).
 * Key: "<scope>:<subject>:<window start ISO>". Works across serverless instances.
 */
import "server-only";
import { getDb } from "@/lib/db";
import { hashIp } from "@/lib/crypto";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
/** Bangladesh day boundaries for the daily cap (UTC+06:00, no DST). */
const DHAKA_OFFSET_MS = 6 * HOUR_MS;

/** Start of the fixed window that contains `now`. Day windows follow Dhaka midnight. */
export function windowStart(now: Date, windowMs: number): Date {
  const offset = windowMs === DAY_MS ? DHAKA_OFFSET_MS : 0;
  const t = now.getTime() + offset;
  return new Date(t - (t % windowMs) - offset);
}

export function rateLimitKey(scope: string, subject: string, start: Date): string {
  return `${scope}:${subject}:${start.toISOString()}`;
}

/** First address in x-forwarded-for, else x-real-ip, else "unknown". */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip")?.trim() || "unknown";
}

/** Salted hash of the client IP (never store the IP itself, SRS 1 section 5.3). */
export function ipHashFor(headers: Headers, salt: string | undefined): string {
  if (!salt && process.env.NODE_ENV === "production") throw new Error("IP_HASH_SALT is not set");
  return hashIp(clientIp(headers), salt || "dev-salt-not-for-production");
}

export interface RateLimitResult {
  ok: boolean;
  count: number;
  limit: number;
  /** Seconds until the window resets. */
  retryAfterS: number;
}

/** Count one hit and say whether it is inside the limit. */
export async function hitRateLimit(opts: {
  scope: string;
  subject: string;
  limit: number;
  windowMs: number;
  now?: Date;
}): Promise<RateLimitResult> {
  const now = opts.now ?? new Date();
  const start = windowStart(now, opts.windowMs);
  const key = rateLimitKey(opts.scope, opts.subject, start);
  const db = getDb();
  let count: number;
  try {
    const row = await db.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, windowStart: start },
      update: { count: { increment: 1 } },
    });
    count = row.count;
  } catch {
    // Two first hits at the same time: the create raced; the row exists now.
    const row = await db.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
    count = row.count;
  }
  const retryAfterS = Math.max(
    1,
    Math.ceil((start.getTime() + opts.windowMs - now.getTime()) / 1000),
  );
  return { ok: count <= opts.limit, count, limit: opts.limit, retryAfterS };
}
