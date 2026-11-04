"use server";
/** FR-D7: short-lived signed URL (10 min) for the private recordings bucket. Staff only. */
import { z } from "zod";
import { RECORDINGS_BUCKET } from "@/contracts";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const SIGNED_URL_SECONDS = 600;

export async function getRecordingUrl(
  callId: string,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const staff = await requireStaff();
  const id = z.uuid().safeParse(callId);
  if (!id.success) return { ok: false, message: "Invalid call id." };
  try {
    const call = await db.call.findFirst({
      where: { id: id.data, clinicId: staff.clinicId },
      select: { recordingPath: true },
    });
    if (!call?.recordingPath) return { ok: false, message: "This call has no recording." };
    const { data, error } = await getSupabaseAdmin()
      .storage.from(RECORDINGS_BUCKET)
      .createSignedUrl(call.recordingPath, SIGNED_URL_SECONDS);
    if (error || !data?.signedUrl) {
      return { ok: false, message: "The recording file was not found in storage." };
    }
    return { ok: true, url: data.signedUrl };
  } catch (err) {
    console.error("[portal] recording url failed", err);
    return { ok: false, message: "Could not create a link to the recording." };
  }
}
