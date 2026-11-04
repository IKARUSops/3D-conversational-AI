/**
 * POST /api/calls/:id/recording-url : signed single-use upload URL for the caller recording
 * (T1.5, O-07). Private bucket `recordings`, path clinic/{clinicId}/calls/{callId}.webm.
 */
import { NextResponse } from "next/server";
import {
  RECORDINGS_BUCKET,
  RecordingUrlRequestSchema,
  recordingPath,
  type RecordingUrlResponse,
} from "@/contracts";
import { jsonError, parseJsonBody } from "@/lib/http";
import { authorizeCall } from "@/lib/services/call-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = await parseJsonBody(req, RecordingUrlRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const auth = await authorizeCall(req, id);
    if (!auth.ok) return auth.response;
    const path = recordingPath(auth.call.clinicId, id);
    const { data, error } = await getSupabaseAdmin()
      .storage.from(RECORDINGS_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !data) {
      console.error(`[recording-url] ${id}:`, error);
      return jsonError("provider_unavailable", "Recording upload is not available");
    }
    return NextResponse.json<RecordingUrlResponse>({
      uploadUrl: data.signedUrl,
      path,
      token: data.token,
    });
  } catch (err) {
    console.error(`[POST /api/calls/${id}/recording-url] failed:`, err);
    return jsonError("internal", "Could not create the upload URL");
  }
}
