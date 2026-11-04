/**
 * Start a call (POST /api/calls, FR-B2, FR-B9, FR-B12). The route handles HTTP; this file holds
 * the logic so it can be tested against PGlite.
 */
import "server-only";
import { timingSafeEqual } from "node:crypto";
import {
  createInitialAgentState,
  recordingPath,
  type ApiErrorCode,
  type EndReason,
  type StartCallRequestParsed,
  type StartCallResponse,
} from "@/contracts";
import { callTokenExpiry, signCallToken } from "@/lib/call-token";
import { getDb } from "@/lib/db";
import type { OptionalServerEnv } from "@/lib/env";
import { DAY_MS, HOUR_MS, hitRateLimit } from "@/lib/rate-limit";
import { loadClinicContext } from "./clinic";
import { logEvent } from "./events";
import { greetingFor } from "./greeting";
import { chooseProviders, platformKeys } from "./providers-choice";

export type StartCallOutcome =
  | { ok: true; response: StartCallResponse }
  | { ok: false; code: ApiErrorCode; message: string; retryAfterS?: number };

type StartEnv = Pick<
  OptionalServerEnv,
  | "CALL_TOKEN_SECRET"
  | "REVIEW_KEY"
  | "MAX_CALL_SECONDS"
  | "RATE_LIMIT_CALLS_PER_IP_HOUR"
  | "DAILY_CALL_CAP"
  | "LLM_PRIMARY"
  | "ELEVENLABS_API_KEY"
  | "OPENAI_API_KEY"
  | "AZURE_SPEECH_KEY"
>;

/** Constant-time compare for the reviewer key. */
export function reviewKeyMatches(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function startCall(
  input: StartCallRequestParsed,
  meta: { ipHash: string; env: StartEnv; now?: Date },
): Promise<StartCallOutcome> {
  const { env } = meta;
  const now = meta.now ?? new Date();
  if (!env.CALL_TOKEN_SECRET)
    return { ok: false, code: "internal", message: "Server is not configured" };

  let clinic;
  try {
    clinic = await loadClinicContext(input.clinicSlug);
  } catch {
    return { ok: false, code: "not_found", message: "Clinic not found" };
  }

  if (!reviewKeyMatches(input.reviewKey, env.REVIEW_KEY)) {
    const perIp = await hitRateLimit({
      scope: "call_ip",
      subject: meta.ipHash,
      limit: env.RATE_LIMIT_CALLS_PER_IP_HOUR,
      windowMs: HOUR_MS,
      now,
    });
    if (!perIp.ok) {
      return {
        ok: false,
        code: "rate_limited",
        message: "Too many calls from this network. Please try again later.",
        retryAfterS: perIp.retryAfterS,
      };
    }
  }
  const daily = await hitRateLimit({
    scope: "call_day",
    subject: "global",
    limit: env.DAILY_CALL_CAP,
    windowMs: DAY_MS,
    now,
  });
  if (!daily.ok) {
    return {
      ok: false,
      code: "daily_cap",
      message: "The demo has reached today's call limit. Please try again tomorrow.",
      retryAfterS: daily.retryAfterS,
    };
  }

  const db = getDb();
  const byokRows = await db.providerKey.findMany({
    where: { clinicId: clinic.id },
    select: { provider: true },
  });
  const chosen = chooseProviders(
    { stt: input.sttProvider, tts: input.ttsProvider },
    { platform: platformKeys(env), byok: new Set(byokRows.map((r) => r.provider)) },
  );
  const greeting = greetingFor(clinic, input.lang);
  const maxSeconds = env.MAX_CALL_SECONDS;

  const call = await db.$transaction(async (tx) => {
    const c = await tx.call.create({
      data: {
        clinicId: clinic.id,
        startedAt: now,
        lastActivityAt: now,
        lang: input.lang,
        sttProvider: chosen.stt,
        ttsProvider: chosen.tts,
        keySource: chosen.keySource,
        llmModel: env.LLM_PRIMARY,
        ipHash: meta.ipHash,
        userAgent: input.userAgent.slice(0, 500) || null,
        agentState: createInitialAgentState(input.lang),
      },
    });
    // The greeting is the first live turn (seq 0); the turn loop continues from seq 1.
    await tx.transcriptTurn.create({
      data: {
        callId: c.id,
        seq: 0,
        speaker: "agent",
        textBn: greeting.text,
        startedMs: 0,
        source: "live",
      },
    });
    return c;
  });
  await logEvent(call.id, "call_started", {
    stt: chosen.stt,
    tts: chosen.tts,
    requested: { stt: input.sttProvider, tts: input.ttsProvider },
    keySource: chosen.keySource,
    lang: input.lang,
  });

  const callToken = signCallToken(
    { callId: call.id, clinicId: clinic.id, expiresAt: callTokenExpiry(maxSeconds, now.getTime()) },
    env.CALL_TOKEN_SECRET,
  );
  return {
    ok: true,
    response: {
      callId: call.id,
      callToken,
      greeting,
      maxSeconds,
      providers: { stt: chosen.stt, tts: chosen.tts },
    },
  };
}

/**
 * Mark a call ended (POST /api/calls/:id/end). Idempotent: a second end changes nothing.
 * Returns whether finalize should be scheduled (call still `pending`).
 */
export async function endCall(
  call: { id: string; clinicId: string; startedAt: Date },
  input: { reason: EndReason; recordingPath?: string },
  now: Date = new Date(),
): Promise<{ alreadyEnded: boolean; finalize: boolean }> {
  const db = getDb();
  // Only the call's own storage path is accepted (no arbitrary bucket paths).
  const path =
    input.recordingPath && input.recordingPath === recordingPath(call.clinicId, call.id)
      ? input.recordingPath
      : undefined;
  const res = await db.call.updateMany({
    where: { id: call.id, endedAt: null },
    data: {
      endedAt: now,
      endReason: input.reason,
      lastActivityAt: now,
      durationS: Math.max(0, Math.round((now.getTime() - call.startedAt.getTime()) / 1000)),
      ...(path ? { recordingPath: path } : {}),
    },
  });
  if (res.count === 0) {
    // Already ended (for example sendBeacon after the normal end). Late recording path is kept.
    if (path)
      await db.call.updateMany({
        where: { id: call.id, recordingPath: null },
        data: { recordingPath: path },
      });
    const row = await db.call.findUnique({
      where: { id: call.id },
      select: { processingState: true },
    });
    return { alreadyEnded: true, finalize: row?.processingState === "pending" };
  }
  await logEvent(call.id, "call_ended", { reason: input.reason, recording: Boolean(path) });
  return { alreadyEnded: false, finalize: true };
}
