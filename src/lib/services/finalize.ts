/**
 * Post-call pipeline (SRS 2 section 9, FR-D15, NFR-4). Runs after POST /end via `after()`, and
 * from the stale-call sweep. Idempotent: only a call in processingState `pending` is claimed.
 *
 * Steps: claim -> metrics -> batch re-transcription -> LLM extraction -> code validation ->
 * (Could) English translation -> patient link -> status from DB facts -> done.
 * Any AI step may fail or return null; the pipeline continues with the live data.
 * A DB error retries the whole run (2 s, 8 s, 20 s); after that processingState = failed.
 */
import "server-only";
import {
  AgentStateSchema,
  createInitialAgentState,
  LIMITS,
  RECORDINGS_BUCKET,
  type AgentState,
  type EndReason,
  type FinalCallStatus,
} from "@/contracts";
import {
  extractCallFields,
  transcribeRecording,
  translateTurnsToEnglish,
  type CallExtraction,
  type LiveTurn,
} from "@/lib/agent/postcall";
import { getDb } from "@/lib/db";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createCallback } from "./callbacks";
import { loadClinicContext } from "./clinic";
import { logEvent } from "./events";
import { buildExtractionRow } from "./extraction-row";
import { computeMetrics } from "./metrics";
import { computeCallStatus, statusFactsFrom } from "./status";
import { nfc } from "./validate";

export interface FinalizeDeps {
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  downloadRecording: (path: string) => Promise<ArrayBuffer | null>;
  transcribe: typeof transcribeRecording;
  extract: typeof extractCallFields;
  translate: typeof translateTurnsToEnglish;
}

export const RETRY_DELAYS_MS = [2_000, 8_000, 20_000] as const;

async function downloadFromStorage(path: string): Promise<ArrayBuffer | null> {
  const { data, error } = await getSupabaseAdmin().storage.from(RECORDINGS_BUCKET).download(path);
  if (error || !data) return null;
  return data.arrayBuffer();
}

const defaultDeps: FinalizeDeps = {
  now: () => new Date(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  downloadRecording: downloadFromStorage,
  transcribe: transcribeRecording,
  extract: extractCallFields,
  translate: translateTurnsToEnglish,
};

export type FinalizeResult =
  | { state: "skipped" }
  | { state: "done"; status: FinalCallStatus }
  | { state: "failed"; status: FinalCallStatus | null; error: string };

function parseState(raw: unknown): AgentState {
  const parsed = AgentStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : createInitialAgentState();
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Status from DB facts only (used by the pipeline and as the failure fallback). */
async function statusFromDb(
  callId: string,
  state: AgentState,
  endReason: EndReason,
  extractedIntent: CallExtraction["intent"] | null,
  extractedOffTopicTurns: number | null = null,
): Promise<FinalCallStatus> {
  const db = getDb();
  const [history, callbacksCreated, events, callerTurns] = await Promise.all([
    db.appointmentHistory.findMany({
      where: { callId },
      orderBy: [{ at: "asc" }, { createdAt: "asc" }],
    }),
    db.callback.count({ where: { callId } }),
    db.callEvent.findMany({ where: { callId, type: { in: ["tool_call", "tool_result"] } } }),
    db.transcriptTurn.count({ where: { callId, source: "live", speaker: "caller" } }),
  ]);
  return computeCallStatus(
    statusFactsFrom({
      history: history.map((h) => ({ action: h.action, at: h.at })),
      callbacksCreated,
      events,
      agentState: state,
      callerTurns,
      endReason,
      extractedIntent,
      extractedOffTopicTurns,
    }),
  );
}

/** Step 3: batch transcript of the caller recording. Returns caller text or null. Never throws. */
async function batchTranscript(
  call: { id: string; clinicId: string; recordingPath: string | null },
  deps: FinalizeDeps,
): Promise<string | null> {
  const db = getDb();
  const existing = await db.transcriptTurn.findMany({
    where: { callId: call.id, source: "batch" },
    orderBy: { seq: "asc" },
  });
  if (existing.length > 0) return existing.map((t) => t.textBn).join(" ");
  if (!call.recordingPath) return null;
  try {
    const audio = await deps.downloadRecording(call.recordingPath);
    if (!audio) return null;
    const result = await deps.transcribe(audio, "audio/webm", call.clinicId);
    if (!result || !result.text.trim()) return null;
    const segments =
      result.segments.length > 0 ? result.segments : [{ startMs: 0, endMs: 0, text: result.text }];
    await db.transcriptTurn.createMany({
      data: segments
        .filter((s) => s.text.trim())
        .map((s, i) => ({
          callId: call.id,
          seq: i,
          speaker: "caller" as const,
          textBn: nfc(s.text.trim()),
          startedMs: Math.round(s.startMs),
          endedMs: Math.round(s.endMs),
          source: "batch" as const,
        })),
      skipDuplicates: true,
    });
    return nfc(result.text);
  } catch (err) {
    await logEvent(call.id, "stt_error", { stage: "batch", error: errText(err) });
    return null;
  }
}

async function runOnce(
  callId: string,
  fallbackReason: EndReason,
  deps: FinalizeDeps,
): Promise<FinalCallStatus> {
  const db = getDb();
  const now = deps.now();
  const call = await db.call.findUniqueOrThrow({
    where: { id: callId },
    include: { turns: { where: { source: "live" }, orderBy: { seq: "asc" } } },
  });
  const state = parseState(call.agentState);
  const endedAt = call.endedAt ?? now;
  const endReason: EndReason = call.endReason ?? fallbackReason;
  const clinic = await loadClinicContext(call.clinicId);

  // Step 2: metrics.
  const events = await db.callEvent.findMany({
    where: { callId, type: { in: ["turn_latency", "interruption", "provider_fallback"] } },
  });
  const metrics = computeMetrics(events, {
    turns: call.turns.filter((t) => t.speaker === "caller").length,
    interruptedTurns: call.turns.filter((t) => t.interrupted).length,
    silencePrompts: state.silencePrompts,
  });

  // Step 3: batch transcript.
  const batchCallerText = await batchTranscript(call, deps);

  // Step 4: extraction (LLM). Failure keeps the live data.
  const liveTurns: LiveTurn[] = call.turns.map((t) => ({
    seq: t.seq,
    speaker: t.speaker,
    text: t.textBn,
    startedMs: t.startedMs ?? 0,
  }));
  let ex: CallExtraction | null = null;
  if (liveTurns.length > 0) {
    try {
      ex = await deps.extract({ liveTurns, batchCallerText, agentState: state, clinic, now });
    } catch (err) {
      await logEvent(callId, "llm_error", { stage: "extraction", error: errText(err) });
    }
  }

  // Step 5: validate in code and store.
  const row = buildExtractionRow(ex, state, clinic, now);
  const { summaryBn, summaryEn, ...fields } = row;
  const data = {
    ...fields,
    fieldConfidence: fields.fieldConfidence,
    validationErrors: fields.validationErrors,
    ...(ex ? { raw: JSON.parse(JSON.stringify(ex)) as object } : {}),
  };
  await db.callExtraction.upsert({ where: { callId }, create: { callId, ...data }, update: data });

  // Step 6 (Could): English text per turn.
  const needEn = call.turns.filter((t) => !t.textEn);
  if (needEn.length > 0) {
    try {
      const en = await deps.translate(needEn.map((t) => t.textBn));
      if (en && en.length === needEn.length) {
        await db.$transaction(
          needEn.map((t, i) =>
            db.transcriptTurn.update({ where: { id: t.id }, data: { textEn: en[i] ?? null } }),
          ),
        );
      }
    } catch (err) {
      await logEvent(callId, "llm_error", { stage: "translate", error: errText(err) });
    }
  }

  // Step 7: link patient.
  let patientId = call.patientId;
  if (!patientId && row.phoneValid && row.phoneE164) {
    const p = await db.patient.upsert({
      where: { clinicId_phoneE164: { clinicId: call.clinicId, phoneE164: row.phoneE164 } },
      create: {
        clinicId: call.clinicId,
        phoneE164: row.phoneE164,
        fullNameBn: row.patientNameBn,
        fullNameEn: row.patientNameEn,
      },
      update: {},
    });
    patientId = p.id;
  }

  // Step 7b: the caller needed staff (emergency, medical question) but the live agent forgot
  // create_callback (TC-12): create it from the extraction so staff see it. Never throws.
  if (ex?.callbackCategory) {
    try {
      const existing = await db.callback.count({ where: { callId } });
      if (existing === 0) {
        const urgent = ex.callbackCategory === "urgent";
        const reason = (ex.reasonForVisit || ex.summaryBn || "Staff follow-up needed").slice(0, 300);
        const r = await createCallback(
          { callId, clinicId: call.clinicId, now: new Date(), state },
          { category: ex.callbackCategory, reason, priority: urgent ? "urgent" : "normal" },
        );
        await logEvent(callId, "tool_result", { name: "create_callback", ok: r.ok, output: { auto: true, ...r } });
      }
    } catch (err) {
      console.error(`[finalize] call ${callId} safety callback failed:`, err);
    }
  }

  // Step 8: status from DB facts.
  const status = await statusFromDb(callId, state, endReason, ex?.intent ?? null, ex?.offTopicTurns ?? null);

  // Step 9: done.
  await db.call.update({
    where: { id: callId },
    data: {
      status,
      processingState: "done",
      endedAt,
      endReason,
      durationS: Math.max(0, Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000)),
      intent: row.intent,
      summaryBn: summaryBn ?? call.summaryBn,
      summaryEn: summaryEn ?? call.summaryEn,
      metrics,
      patientId,
    },
  });
  return status;
}

/** Finalize one call. Safe to call many times; only one run claims a `pending` call. */
export async function finalizeCall(
  callId: string,
  opts: { endReason?: EndReason; deps?: Partial<FinalizeDeps> } = {},
): Promise<FinalizeResult> {
  const deps: FinalizeDeps = { ...defaultDeps, ...opts.deps };
  const fallbackReason = opts.endReason ?? "tab_closed";
  const db = getDb();
  const claimed = await db.call.updateMany({
    where: { id: callId, processingState: "pending" },
    data: { processingState: "running" },
  });
  if (claimed.count === 0) return { state: "skipped" };
  const started = Date.now();
  await logEvent(callId, "finalize_started", {});

  let lastError = "";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const status = await runOnce(callId, fallbackReason, deps);
      await logEvent(callId, "finalize_done", { status, attempt, ms: Date.now() - started });
      return { state: "done", status };
    } catch (err) {
      lastError = errText(err);
      console.error(`[finalize] call ${callId} attempt ${attempt + 1} failed:`, err);
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay !== undefined) await deps.sleep(delay);
    }
  }

  // Give up: keep live data, status from live facts when the DB allows it.
  let status: FinalCallStatus | null = null;
  try {
    const call = await db.call.findUniqueOrThrow({ where: { id: callId } });
    const endReason = call.endReason ?? fallbackReason;
    status = await statusFromDb(callId, parseState(call.agentState), endReason, null);
    await db.call.update({
      where: { id: callId },
      data: { processingState: "failed", status, endedAt: call.endedAt ?? deps.now(), endReason },
    });
  } catch (err) {
    console.error(`[finalize] call ${callId} could not save the failed state:`, err);
  }
  await logEvent(callId, "finalize_failed", { error: lastError });
  return { state: "failed", status, error: lastError };
}

/**
 * Stale calls (SRS 2 section 9 step 10, FR-B14): finalize calls with no activity for 3 minutes
 * (tab closed without a beacon) and ended calls whose finalize never ran. Never throws.
 */
export async function sweepStaleCalls(
  opts: { now?: Date; limit?: number; deps?: Partial<FinalizeDeps> } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - LIMITS.STALE_CALL_MS);
  try {
    const db = getDb();
    // A run killed by the platform time limit stays `running`; give it back to the sweep.
    await db.call.updateMany({
      where: {
        processingState: "running",
        updatedAt: { lt: new Date(now.getTime() - 2 * LIMITS.STALE_CALL_MS) },
      },
      data: { processingState: "pending" },
    });
    const stale = await db.call.findMany({
      where: {
        processingState: "pending",
        OR: [{ endedAt: null, lastActivityAt: { lt: cutoff } }, { endedAt: { lt: cutoff } }],
      },
      orderBy: { lastActivityAt: "asc" },
      take: opts.limit ?? 5,
      select: { id: true, endedAt: true, lastActivityAt: true, startedAt: true },
    });
    for (const c of stale) {
      if (!c.endedAt) {
        await db.call.updateMany({
          where: { id: c.id, endedAt: null },
          data: { endedAt: c.lastActivityAt, endReason: "tab_closed" },
        });
        await logEvent(c.id, "call_ended", { reason: "tab_closed", by: "stale_sweep" });
      }
      await finalizeCall(c.id, { endReason: "tab_closed", deps: opts.deps });
    }
    // Housekeeping: old rate limit windows.
    await db.rateLimit.deleteMany({
      where: { windowStart: { lt: new Date(now.getTime() - 2 * 86_400_000) } },
    });
    return stale.length;
  } catch (err) {
    console.error("[sweepStaleCalls] failed:", err);
    return 0;
  }
}
