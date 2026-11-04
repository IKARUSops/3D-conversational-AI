/** GET /api/providers : STT/TTS options and whether a platform key exists. No secrets (FR-B2). */
import { NextResponse } from "next/server";
import { providerAvailability } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(providerAvailability(), {
    headers: { "Cache-Control": "no-store" },
  });
}
