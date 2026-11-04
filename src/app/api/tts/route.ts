/** POST /api/tts : one sentence to an audio/mpeg stream, fallback before the first byte (FR-C14). */
import { HEADERS, TtsRequestSchema } from "@/contracts";
import { requireCallToken } from "@/lib/services/call-auth";
import { jsonError, parseJsonBody } from "@/lib/http";
import { AllProvidersFailedError, synthesizeWithFallback } from "@/lib/providers/registry";
import { logEvent } from "@/lib/services";
import { ttsNormalize } from "@/lib/text/tts-normalize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await parseJsonBody(req, TtsRequestSchema);
  if (!body.ok) return body.response;
  const auth = requireCallToken(req, body.data.callId);
  if (!auth.ok) return auth.response;

  // The client sends ttsText already; normalising again is safe (idempotent on speakable text).
  const lang = /[ঀ-৿]/.test(body.data.text) ? "bn" : "en";
  const text = ttsNormalize(body.data.text, lang);
  if (!text) return jsonError("invalid_request", "Nothing to speak");

  try {
    const r = await synthesizeWithFallback({
      text,
      lang,
      start: body.data.provider,
      clinicId: auth.payload.clinicId,
      callId: auth.payload.callId,
      signal: req.signal,
    });
    return new Response(r.stream, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        [HEADERS.PROVIDER]: r.provider,
        ...(r.fallbackFrom ? { [HEADERS.FALLBACK_FROM]: r.fallbackFrom } : {}),
      },
    });
  } catch (err) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    const reason = err instanceof Error ? err.message.slice(0, 300) : "unknown";
    await logEvent(auth.payload.callId, "tts_error", { provider: body.data.provider, seq: body.data.seq, reason });
    if (err instanceof AllProvidersFailedError) {
      return jsonError("all_providers_failed", "Voice is not available right now");
    }
    return jsonError("internal", "Voice failed");
  }
}
