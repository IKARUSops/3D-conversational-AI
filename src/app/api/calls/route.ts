/**
 * POST /api/calls : start a call (T1.5; FR-B2, FR-B9, FR-B12, SRS 2 section 5.2).
 * Public + rate limited (30/IP/hour, daily cap; a matching reviewKey skips the per-IP limit).
 * After the response, finalizes stale calls (SRS 2 section 9 step 10).
 */
import { after, NextResponse } from "next/server";
import { StartCallRequestSchema, type StartCallResponse } from "@/contracts";
import { optionalServerEnv } from "@/lib/env";
import { jsonError, parseJsonBody } from "@/lib/http";
import { ipHashFor } from "@/lib/rate-limit";
import { startCall } from "@/lib/services/calls";
import { sweepStaleCalls } from "@/lib/services/finalize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, StartCallRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const env = optionalServerEnv();
    // Clear message (not a crash) when the deployment has no env yet (I-09).
    const missing = (["DATABASE_URL", "CALL_TOKEN_SECRET", "IP_HASH_SALT"] as const).filter(
      (k) => !env[k],
    );
    if (missing.length > 0 || (!env.GOOGLE_GENERATIVE_AI_API_KEY && !env.OPENAI_API_KEY)) {
      console.error("[POST /api/calls] not configured, missing:", missing.join(", ") || "LLM key");
      return jsonError(
        "provider_unavailable",
        "The voice demo is not configured on this server yet. Please try again later.",
      );
    }
    const ipHash = ipHashFor(req.headers, env.IP_HASH_SALT);
    const out = await startCall(parsed.data, { ipHash, env });
    after(() => sweepStaleCalls());
    if (!out.ok) {
      return jsonError(out.code, out.message, {
        headers: out.retryAfterS ? { "Retry-After": String(out.retryAfterS) } : undefined,
      });
    }
    return NextResponse.json<StartCallResponse>(out.response, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[POST /api/calls] failed:", err);
    return jsonError("internal", "Could not start the call. Please try again.");
  }
}
