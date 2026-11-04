/**
 * POST /api/calls/:id/end : end the call, then finalize in the background (T1.5, T1.6).
 * Token in `Authorization: Bearer` OR in the body (navigator.sendBeacon, FR-B14). Idempotent.
 */
import { after, NextResponse } from "next/server";
import { EndCallRequestSchema, type EndCallResponse } from "@/contracts";
import { jsonError, parseJsonBody } from "@/lib/http";
import { authorizeCall } from "@/lib/services/call-auth";
import { endCall } from "@/lib/services/calls";
import { finalizeCall } from "@/lib/services/finalize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // sendBeacon sends text/plain; req.json() still parses the JSON text.
  const parsed = await parseJsonBody(req, EndCallRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const auth = await authorizeCall(req, id, { bodyToken: parsed.data.token, allowEnded: true });
    if (!auth.ok) return auth.response;
    const res = await endCall(auth.call, {
      reason: parsed.data.reason,
      recordingPath: parsed.data.recordingPath,
    });
    if (res.finalize) {
      after(() => finalizeCall(id, { endReason: parsed.data.reason }));
    }
    return NextResponse.json<EndCallResponse>({ ok: true });
  } catch (err) {
    console.error(`[POST /api/calls/${id}/end] failed:`, err);
    return jsonError("internal", "Could not end the call");
  }
}
