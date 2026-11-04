/**
 * Call API auth (SRS 2 section 5.3, AT-22). One module for every call API (DECISIONS I-03):
 * - `requireCallToken`: signed token only, no DB read. Used by /api/stt and /api/tts (one
 *   request per sentence, latency matters) and by /turn, whose prepareTurn then loads the call
 *   and checks clinic and ended state itself.
 * - `authorizeCall`: token (header, or body for sendBeacon) + call exists + (unless allowed)
 *   not ended. Used by /end and /recording-url.
 */
import "server-only";
import type { NextResponse } from "next/server";
import type { ApiError } from "@/contracts";
import { bearerToken, verifyCallToken, type CallTokenPayload } from "@/lib/call-token";
import { getDb } from "@/lib/db";
import { jsonError } from "@/lib/http";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuthorizedCall {
  id: string;
  clinicId: string;
  endedAt: Date | null;
  processingState: "pending" | "running" | "done" | "failed";
  startedAt: Date;
}

export type AuthResult =
  { ok: true; call: AuthorizedCall } | { ok: false; response: NextResponse<ApiError> };

export type TokenResult =
  | { ok: true; payload: CallTokenPayload }
  | { ok: false; response: NextResponse<ApiError> };

/**
 * Verifies the call token (`Authorization: Bearer`, or `bodyToken` for sendBeacon) and, when
 * given, that it belongs to `callId`. No DB read.
 */
export function requireCallToken(
  req: Request,
  callId?: string,
  opts: { bodyToken?: string | null } = {},
): TokenResult {
  const secret = process.env.CALL_TOKEN_SECRET;
  if (!secret) return { ok: false, response: jsonError("internal", "Server is not configured") };
  const token = bearerToken(req.headers.get("authorization")) ?? opts.bodyToken ?? null;
  const v = verifyCallToken(token, secret);
  if (!v.ok || (callId !== undefined && (v.payload.callId !== callId || !UUID_RE.test(callId)))) {
    return { ok: false, response: jsonError("unauthorized", "Missing or invalid call token") };
  }
  return { ok: true, payload: v.payload };
}

export async function authorizeCall(
  req: Request,
  callId: string,
  opts: { bodyToken?: string | null; allowEnded?: boolean } = {},
): Promise<AuthResult> {
  const v = requireCallToken(req, callId, { bodyToken: opts.bodyToken });
  if (!v.ok) return v;
  const call = await getDb().call.findFirst({
    where: { id: callId, clinicId: v.payload.clinicId },
    select: { id: true, clinicId: true, endedAt: true, processingState: true, startedAt: true },
  });
  if (!call) return { ok: false, response: jsonError("not_found", "Call not found") };
  if (call.endedAt && !opts.allowEnded) {
    return { ok: false, response: jsonError("call_ended", "This call has ended") };
  }
  return { ok: true, call };
}
