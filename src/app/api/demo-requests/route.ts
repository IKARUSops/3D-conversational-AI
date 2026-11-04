/** POST /api/demo-requests : landing contact form (FR-A7). Public, 5 per IP per hour. */
import { NextResponse } from "next/server";
import { DemoRequestSchema } from "@/contracts";
import { getDb } from "@/lib/db";
import { optionalServerEnv } from "@/lib/env";
import { jsonError, parseJsonBody } from "@/lib/http";
import { HOUR_MS, hitRateLimit, ipHashFor } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEMO_PER_IP_HOUR = 5;
const nfc = (s: string | undefined): string | null =>
  s ? s.normalize("NFC").trim() || null : null;

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, DemoRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const ipHash = ipHashFor(req.headers, optionalServerEnv().IP_HASH_SALT);
    const rl = await hitRateLimit({
      scope: "demo_ip",
      subject: ipHash,
      limit: DEMO_PER_IP_HOUR,
      windowMs: HOUR_MS,
    });
    if (!rl.ok) {
      return jsonError("rate_limited", "Too many requests. Please try again later.", {
        headers: { "Retry-After": String(rl.retryAfterS) },
      });
    }
    const d = parsed.data;
    await getDb().demoRequest.create({
      data: {
        name: d.name.normalize("NFC"),
        clinicName: d.clinicName.normalize("NFC"),
        phone: d.phone.normalize("NFC"),
        email: nfc(d.email),
        message: nfc(d.message),
        ipHash,
      },
    });
    return NextResponse.json({ ok: true as const }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/demo-requests] failed:", err);
    return jsonError("internal", "Could not save your request. Please try again.");
  }
}
