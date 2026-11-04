/**
 * Stale-call sweep hook for the calls list (SRS 2 section 9 step 10, FR-B14).
 *
 * Fire and forget: the sweep (Agent A, src/lib/services/finalize.ts) runs after the response
 * through `after()`, so finalize work (LLM extraction) never slows or breaks the page.
 * `sweepStaleCalls` in services never throws; the try/catch covers `after()` itself.
 */
import "server-only";
import { after } from "next/server";
import { sweepStaleCalls as finalizeStaleCalls } from "@/lib/services/finalize";

export async function sweepStaleCalls(): Promise<void> {
  try {
    after(async () => {
      await finalizeStaleCalls();
    });
  } catch (err) {
    console.error("[portal] could not schedule the stale sweep", err);
  }
}
