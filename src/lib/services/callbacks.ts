/** create_callback (FR-C13, FR-C11): human follow-up row using the caller's name and phone. */
import "server-only";
import type { CreateCallbackInput, CreateCallbackOutput } from "@/contracts";
import { getDb } from "@/lib/db";
import type { ToolContext } from "@/lib/services";
import { checkBdPhone, cleanName } from "./validate";

/** Pure: name/phone for a callback from state, or the error to ask about. */
export function callbackContact(
  state: ToolContext["state"],
):
  | { ok: true; name: string; e164: string }
  | { ok: false; error: "missing_name" | "missing_phone" | "invalid_phone" } {
  const name = cleanName(state.patient?.nameBn) ?? cleanName(state.patient?.nameEn);
  if (!name) return { ok: false, error: "missing_name" };
  const raw = state.phone?.e164 ?? state.phone?.raw;
  if (!raw) return { ok: false, error: "missing_phone" };
  const check = checkBdPhone(raw);
  if (!check.valid) return { ok: false, error: "invalid_phone" };
  return { ok: true, name, e164: check.e164 };
}

export async function createCallback(
  ctx: ToolContext,
  input: CreateCallbackInput,
): Promise<CreateCallbackOutput> {
  const contact = callbackContact(ctx.state);
  if (!contact.ok) return contact;
  const db = getDb();
  const patient = await db.patient.upsert({
    where: { clinicId_phoneE164: { clinicId: ctx.clinicId, phoneE164: contact.e164 } },
    create: {
      clinicId: ctx.clinicId,
      phoneE164: contact.e164,
      fullNameBn: cleanName(ctx.state.patient?.nameBn),
      fullNameEn: cleanName(ctx.state.patient?.nameEn),
    },
    update: {},
  });
  const row = await db.callback.create({
    data: {
      clinicId: ctx.clinicId,
      callId: ctx.callId,
      patientId: patient.id,
      name: contact.name,
      phoneE164: contact.e164,
      category: input.category,
      reason: input.reason.normalize("NFC"),
      priority: input.category === "urgent" ? "urgent" : input.priority,
    },
  });
  return { ok: true, callbackId: row.id };
}
