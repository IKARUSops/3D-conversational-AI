/**
 * Small helpers for route handlers: consistent JSON errors (ApiErrorSchema) and zod parsing.
 */
import { NextResponse } from "next/server";
import type { z } from "zod";
import { API_ERROR_STATUS, type ApiError, type ApiErrorCode } from "@/contracts";

export function jsonError(
  code: ApiErrorCode,
  message: string,
  init?: { status?: number; details?: unknown; headers?: HeadersInit },
): NextResponse<ApiError> {
  return NextResponse.json(
    { error: { code, message, ...(init?.details !== undefined ? { details: init.details } : {}) } },
    { status: init?.status ?? API_ERROR_STATUS[code], headers: init?.headers },
  );
}

/** Placeholder response for routes that a Phase 1 agent has not built yet. */
export function notImplemented(route: string): NextResponse<ApiError> {
  return jsonError("internal", `${route} is not implemented yet`, { status: 501 });
}

/** Parses a JSON body with a zod schema. Returns the data or a ready 400 response. */
export async function parseJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: NextResponse<ApiError> }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: jsonError("invalid_request", "Body must be JSON") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError("invalid_request", "Invalid request body", {
        details: parsed.error.issues,
      }),
    };
  }
  return { ok: true, data: parsed.data };
}
