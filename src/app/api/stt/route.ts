/** POST /api/stt : server STT on a VAD clip (wav 16 kHz mono, max 2 MB) with fallback (FR-C14). */
import { NextResponse } from "next/server";
import { HEADERS, LIMITS, SttFormFieldsSchema, type SttResponse } from "@/contracts";
import { requireCallToken } from "@/lib/services/call-auth";
import { jsonError } from "@/lib/http";
import { AllProvidersFailedError, transcribeClipWithFallback } from "@/lib/providers/registry";
import { logEvent } from "@/lib/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > LIMITS.STT_CLIP_MAX_BYTES + 64 * 1024) {
    return jsonError("payload_too_large", "Audio clip is too large");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("invalid_request", "Body must be multipart form data");
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) return jsonError("invalid_request", "Missing audio file");
  if (audio.size > LIMITS.STT_CLIP_MAX_BYTES) return jsonError("payload_too_large", "Audio clip is too large");
  if (audio.size < 44) return jsonError("invalid_request", "Audio clip is empty");

  const fields: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (k !== "audio" && typeof v === "string") fields[k] = v;
  const parsed = SttFormFieldsSchema.safeParse(fields);
  if (!parsed.success) return jsonError("invalid_request", "Invalid form fields", { details: parsed.error.issues });

  const auth = requireCallToken(req, parsed.data.callId);
  if (!auth.ok) return auth.response;

  try {
    const r = await transcribeClipWithFallback({
      wav: await audio.arrayBuffer(),
      lang: parsed.data.lang,
      start: parsed.data.provider,
      clinicId: auth.payload.clinicId,
      callId: auth.payload.callId,
      signal: req.signal,
    });
    const body: SttResponse = {
      text: r.text.normalize("NFC"),
      ...(r.confidence !== undefined ? { confidence: Math.max(0, Math.min(1, r.confidence)) } : {}),
      provider: r.provider,
      ms: r.ms,
      ...(r.fallbackFrom ? { fallbackFrom: r.fallbackFrom } : {}),
    };
    return NextResponse.json(body, {
      headers: { [HEADERS.PROVIDER]: r.provider, ...(r.fallbackFrom ? { [HEADERS.FALLBACK_FROM]: r.fallbackFrom } : {}) },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 300) : "unknown";
    await logEvent(auth.payload.callId, "stt_error", { provider: parsed.data.provider, reason });
    if (err instanceof AllProvidersFailedError) {
      return jsonError("all_providers_failed", "Speech recognition is not available right now");
    }
    return jsonError("internal", "Speech recognition failed");
  }
}
