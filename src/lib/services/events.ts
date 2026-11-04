/** Append-only audit rows in call_events (SRS 2 section 7.3). Never throws. */
import "server-only";
import type { EventType } from "@/contracts";
import { getDb } from "@/lib/db";

/** JSON-safe copy (drops undefined, Dates become ISO strings). */
function toJson(payload: Record<string, unknown>): object {
  try {
    return JSON.parse(JSON.stringify(payload)) as object;
  } catch {
    return { unserializable: true };
  }
}

export async function logEvent(
  callId: string,
  type: EventType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    await getDb().callEvent.create({
      data: { callId: callId || null, type, payload: toJson(payload) },
    });
  } catch (err) {
    console.error(`[logEvent] ${type} for call ${callId} failed:`, err);
  }
}
