/**
 * Database access for the live turn loop (calls.agent_state and transcript_turns).
 * Kept behind the `TurnStore` interface so turn.ts can be tested without a database.
 */
import "server-only";
import type { AgentState, CallLang, InputMode, Speaker } from "@/contracts";
import { getDb, Prisma } from "@/lib/db";

export interface CallRow {
  id: string;
  clinicId: string;
  startedAt: Date;
  endedAt: Date | null;
  lang: CallLang;
  agentState: unknown;
}

export interface NewTurn {
  speaker: Speaker;
  text: string;
  startedMs: number;
  inputMode?: InputMode;
  sttConfidence?: number;
  interrupted?: boolean;
}

export interface TurnStore {
  loadCall(callId: string): Promise<CallRow | null>;
  /** Last `limit` live turns, oldest first. */
  loadHistory(callId: string, limit: number): Promise<Array<{ speaker: Speaker; text: string }>>;
  saveTurn(callId: string, turn: NewTurn): Promise<void>;
  /**
   * Barge-in (FR-C17): if the last live turn is the agent's, keep only its spoken part;
   * if the agent reply was never saved (its turn was aborted), save the spoken part as a new
   * interrupted agent turn.
   */
  recordInterruption(callId: string, spokenPrefix: string, startedMs: number): Promise<void>;
  /** Saves state; never lowers lastTurnSeq (a newer turn may have claimed it). */
  saveState(callId: string, state: AgentState, extra?: { llmModel?: string }): Promise<void>;
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

export const prismaTurnStore: TurnStore = {
  async loadCall(callId) {
    const row = await getDb().call.findUnique({
      where: { id: callId },
      select: { id: true, clinicId: true, startedAt: true, endedAt: true, lang: true, agentState: true },
    });
    return row ? { ...row, lang: row.lang as CallLang } : null;
  },

  async loadHistory(callId, limit) {
    const rows = await getDb().transcriptTurn.findMany({
      where: { callId, source: "live" },
      orderBy: { seq: "desc" },
      take: limit,
      select: { speaker: true, textBn: true },
    });
    return rows.reverse().map((r) => ({ speaker: r.speaker as Speaker, text: r.textBn }));
  },

  async saveTurn(callId, turn) {
    const db = getDb();
    for (let attempt = 0; attempt < 3; attempt++) {
      const agg = await db.transcriptTurn.aggregate({
        where: { callId, source: "live" },
        _max: { seq: true },
      });
      const seq = (agg._max.seq ?? -1) + 1;
      try {
        await db.transcriptTurn.create({
          data: {
            callId,
            seq,
            speaker: turn.speaker,
            textBn: turn.text,
            startedMs: Math.max(0, Math.round(turn.startedMs)),
            source: "live",
            ...(turn.inputMode ? { inputMode: turn.inputMode } : {}),
            ...(turn.sttConfidence !== undefined ? { sttConfidence: turn.sttConfidence } : {}),
            ...(turn.interrupted ? { interrupted: true } : {}),
          },
        });
        return;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
  },

  async recordInterruption(callId, spokenPrefix, startedMs) {
    const db = getDb();
    const last = await db.transcriptTurn.findFirst({
      where: { callId, source: "live" },
      orderBy: { seq: "desc" },
      select: { id: true, speaker: true },
    });
    const prefix = spokenPrefix.trim();
    if (last?.speaker === "agent") {
      await db.transcriptTurn.update({ where: { id: last.id }, data: { textBn: prefix || "…", interrupted: true } });
    } else if (prefix) {
      await prismaTurnStore.saveTurn(callId, { speaker: "agent", text: prefix, startedMs, interrupted: true });
    }
  },

  async saveState(callId, state, extra) {
    const db = getDb();
    const current = await db.call.findUnique({ where: { id: callId }, select: { agentState: true } });
    const dbSeq = (current?.agentState as { lastTurnSeq?: number } | null)?.lastTurnSeq;
    const lastTurnSeq = Math.max(dbSeq ?? -1, state.lastTurnSeq ?? -1);
    const dbNext = (current?.agentState as { nextAgentSeq?: number } | null)?.nextAgentSeq ?? 0;
    const merged: AgentState = {
      ...state,
      ...(lastTurnSeq >= 0 ? { lastTurnSeq } : {}),
      nextAgentSeq: Math.max(dbNext, state.nextAgentSeq ?? 0),
    };
    await db.call.update({
      where: { id: callId },
      data: {
        agentState: merged as unknown as Prisma.InputJsonValue,
        lastActivityAt: new Date(),
        ...(merged.intent ? { intent: merged.intent } : {}),
        ...(extra?.llmModel ? { llmModel: extra.llmModel } : {}),
      },
    });
  },
};
