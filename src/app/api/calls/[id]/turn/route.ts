/**
 * POST /api/calls/:id/turn : SSE turn loop (SRS 2 sections 5.2 and 7.1).
 * Client: fetch() + body.getReader(), never EventSource. One `data: {json}` line per event.
 */
import { SSE_HEADERS, TurnRequestSchema, type TurnEvent } from "@/contracts";
import { requireCallToken } from "@/lib/services/call-auth";
import { encodeSse } from "@/lib/agent/sse";
import { prismaTurnStore } from "@/lib/agent/store";
import { prepareTurn, runTurn } from "@/lib/agent/turn";
import { jsonError, parseJsonBody } from "@/lib/http";
import { getLlmChain } from "@/lib/providers/registry";
import * as services from "@/lib/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: callId } = await ctx.params;
  const auth = requireCallToken(req, callId);
  if (!auth.ok) return auth.response;
  const body = await parseJsonBody(req, TurnRequestSchema);
  if (!body.ok) return body.response;

  let prep;
  try {
    prep = await prepareTurn(callId, auth.payload.clinicId, body.data, prismaTurnStore);
  } catch (err) {
    console.error("[turn] prepare", err);
    return jsonError("internal", "Could not load the call");
  }
  if (!prep.ok) return jsonError(prep.code, prep.message);
  const { call, state } = prep;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (e: TurnEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeSse(e)));
        } catch {
          closed = true;
        }
      };
      try {
        await runTurn(
          { callId, clinicId: auth.payload.clinicId, call, state, body: body.data, signal: req.signal },
          {
            store: prismaTurnStore,
            loadClinic: services.loadClinicContext,
            llms: getLlmChain(),
            services,
          },
          emit,
        );
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed (client aborted)
        }
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
