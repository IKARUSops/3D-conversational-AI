/**
 * Call token (SRS 2 section 5.3): HMAC-SHA256 over `callId|clinicId|expiresAt`.
 *
 * Token format: `<callId>.<clinicId>.<expiresAt>.<signature>`
 *   - expiresAt: unix seconds
 *   - signature: base64url HMAC-SHA256 with CALL_TOKEN_SECRET
 *
 * The pure functions take the secret as an argument (easy to test). Route handlers use
 * `signCallTokenFromEnv` / `verifyCallTokenFromEnv`, then also check that the call is not ended.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { LIMITS } from "@/contracts";

export interface CallTokenPayload {
  callId: string;
  clinicId: string;
  /** Unix seconds. */
  expiresAt: number;
}

export type VerifyResult =
  | { ok: true; payload: CallTokenPayload }
  | { ok: false; reason: "missing" | "malformed" | "bad_signature" | "expired" };

const MIN_SECRET_LENGTH = 32;

function hmac(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function assertSecret(secret: string): void {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`CALL_TOKEN_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
}

/** Expiry for a new call: now + maxSeconds + grace (SRS 2 section 5.3). */
export function callTokenExpiry(maxSeconds: number, nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000) + maxSeconds + LIMITS.CALL_TOKEN_GRACE_SECONDS;
}

export function signCallToken(payload: CallTokenPayload, secret: string): string {
  assertSecret(secret);
  const { callId, clinicId, expiresAt } = payload;
  if (
    callId.includes(".") ||
    clinicId.includes(".") ||
    callId.includes("|") ||
    clinicId.includes("|")
  ) {
    throw new Error("callId and clinicId must not contain '.' or '|'");
  }
  const sig = hmac(secret, `${callId}|${clinicId}|${expiresAt}`);
  return `${callId}.${clinicId}.${expiresAt}.${sig}`;
}

export function verifyCallToken(
  token: string | null | undefined,
  secret: string,
  nowMs: number = Date.now(),
): VerifyResult {
  assertSecret(secret);
  if (!token) return { ok: false, reason: "missing" };
  const parts = token.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };
  const [callId, clinicId, expRaw, sig] = parts as [string, string, string, string];
  if (!callId || !clinicId || !/^\d+$/.test(expRaw) || !sig)
    return { ok: false, reason: "malformed" };
  const expiresAt = Number(expRaw);

  const expected = Buffer.from(hmac(secret, `${callId}|${clinicId}|${expiresAt}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "bad_signature" };
  }
  if (Math.floor(nowMs / 1000) > expiresAt) return { ok: false, reason: "expired" };
  return { ok: true, payload: { callId, clinicId, expiresAt } };
}

/** Reads `Authorization: Bearer <token>`; returns null when absent. */
export function bearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return m?.[1]?.trim() || null;
}

function envSecret(): string {
  const secret = process.env.CALL_TOKEN_SECRET;
  if (!secret) throw new Error("CALL_TOKEN_SECRET is not set");
  return secret;
}

export const signCallTokenFromEnv = (payload: CallTokenPayload): string =>
  signCallToken(payload, envSecret());

export const verifyCallTokenFromEnv = (token: string | null | undefined): VerifyResult =>
  verifyCallToken(token, envSecret());
