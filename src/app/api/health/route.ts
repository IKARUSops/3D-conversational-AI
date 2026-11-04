/**
 * GET /api/health : keep-alive and uptime check (NFR-1, SRS 2 section 10).
 * Runs a real query (select 1 + count on clinics) so Supabase sees database activity.
 * Never cached. Returns 503 with { ok: false, db: false } when the database is unreachable.
 * Hit by: UptimeRobot (30 min), GitHub Actions (6 h), Vercel cron (daily).
 */
import { NextResponse } from "next/server";
import type { HealthResponse } from "@/contracts";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DB_TIMEOUT_MS = 5000;

async function checkDb(): Promise<boolean> {
  const db = getDb();
  await db.$queryRaw`select 1`;
  await db.clinic.count();
  return true;
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  let dbOk = false;
  try {
    dbOk = await Promise.race([
      checkDb(),
      new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error("db timeout")), DB_TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    console.error("[health] database check failed:", err instanceof Error ? err.message : err);
    dbOk = false;
  }
  const body: HealthResponse = { ok: dbOk, db: dbOk, ts: new Date().toISOString() };
  return NextResponse.json(body, {
    status: dbOk ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
