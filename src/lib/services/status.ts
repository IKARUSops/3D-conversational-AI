/**
 * Final call status (SRS 1 section 4.5.1). Pure. Decided from DB facts, never by the LLM.
 *
 * First match wins:
 *   1. booked / rescheduled / cancelled (latest appointment action in this call)
 *   2. follow_up_needed (a callback was created)
 *   3. spam (3 off-topic turns in a row, or abuse)
 *   4. enquiry (information was given)
 *   5. incomplete (ended before the task finished)
 *   6. failed (technical failure and nothing useful saved)
 */
import {
  OFF_TOPIC_LIMIT,
  type AgentState,
  type AppointmentAction,
  type EndReason,
  type FinalCallStatus,
  type Intent,
  type StatusFacts,
} from "@/contracts";

const ACTION_STATUS: Record<AppointmentAction, FinalCallStatus> = {
  created: "booked",
  rescheduled: "rescheduled",
  cancelled: "cancelled",
};

export function computeCallStatus(f: StatusFacts): FinalCallStatus {
  if (f.appointmentActions.length > 0) {
    // Stable sort by time; for equal times the later array entry is the later action.
    const latest = f.appointmentActions
      .map((a, i) => ({ ...a, i, t: Date.parse(a.at) }))
      .sort((a, b) => a.t - b.t || a.i - b.i)
      .at(-1)!;
    return ACTION_STATUS[latest.action];
  }
  if (f.callbacksCreated > 0) return "follow_up_needed";
  if (f.abuse || f.offTopicStreakMax >= OFF_TOPIC_LIMIT) return "spam";
  if (f.infoGiven) return "enquiry";
  if (f.technicalFailure) return "failed";
  return "incomplete";
}

/** Raw DB rows that finalize collects for one call. */
export interface StatusSources {
  history: Array<{ action: AppointmentAction; at: Date }>;
  callbacksCreated: number;
  events: Array<{ type: string; payload: unknown }>;
  agentState: AgentState;
  callerTurns: number;
  endReason: EndReason;
  /** Intent from the post-call extraction, used only as a weak enquiry signal. */
  extractedIntent?: Intent | null;
  /** Off-topic caller turns counted by the post-call extraction (TC-11 safety net). */
  extractedOffTopicTurns?: number | null;
}

/** Tools whose use means the caller got information. */
const INFO_TOOLS = new Set([
  "get_clinic_info",
  "check_availability",
  "find_appointments",
  "resolve_datetime",
]);

interface ToolPayload {
  name?: unknown;
  input?: { kind?: unknown } | null;
  output?: { streak?: unknown } | null;
}

const asTool = (p: unknown): ToolPayload => (p && typeof p === "object" ? (p as ToolPayload) : {});

/** Turn DB rows into StatusFacts (pure). */
export function statusFactsFrom(src: StatusSources): StatusFacts {
  let offTopicStreakMax = src.agentState.offTopicStreak ?? 0;
  let abuse = false;
  let infoGiven = false;
  for (const e of src.events) {
    if (e.type !== "tool_call" && e.type !== "tool_result") continue;
    const p = asTool(e.payload);
    const name = typeof p.name === "string" ? p.name : "";
    if (name === "flag_off_topic") {
      if (p.input?.kind === "abuse") abuse = true;
      const streak = p.output?.streak;
      if (typeof streak === "number") offTopicStreakMax = Math.max(offTopicStreakMax, streak);
    }
    if (INFO_TOOLS.has(name)) infoGiven = true;
  }
  if (src.agentState.intent === "enquiry" || src.extractedIntent === "enquiry") {
    infoGiven = infoGiven || src.callerTurns > 0;
  }
  // The live agent may forget flag_off_topic (TC-11); trust the post-call count when the caller
  // got no real information.
  if (!infoGiven && typeof src.extractedOffTopicTurns === "number") {
    offTopicStreakMax = Math.max(offTopicStreakMax, src.extractedOffTopicTurns);
  }
  return {
    appointmentActions: src.history.map((h) => ({ action: h.action, at: h.at.toISOString() })),
    callbacksCreated: src.callbacksCreated,
    offTopicStreakMax,
    abuse,
    infoGiven,
    callerSpoke: src.callerTurns > 0,
    endReason: src.endReason,
    technicalFailure: src.endReason === "error",
  };
}
