"use server";
/** FR-D10: mark a callback done with a note. Admin or receptionist; blocked for read-only. */
import { revalidatePath } from "next/cache";
import { CallbackDoneRequestSchema } from "@/contracts";
import { canWrite, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";

export interface CallbackActionState {
  ok?: boolean;
  error?: string;
}

export async function markCallbackDone(
  _prev: CallbackActionState,
  form: FormData,
): Promise<CallbackActionState> {
  const staff = await requireStaff();
  if (!canWrite(staff)) return { error: "The reviewer account is read only." };
  const parsed = CallbackDoneRequestSchema.safeParse({
    callbackId: form.get("callbackId"),
    note:
      String(form.get("note") ?? "")
        .normalize("NFC")
        .trim() || undefined,
  });
  if (!parsed.success) return { error: "The note is too long or the callback id is invalid." };
  try {
    const res = await db.callback.updateMany({
      where: { id: parsed.data.callbackId, clinicId: staff.clinicId, status: "open" },
      data: {
        status: "done",
        note: parsed.data.note ?? null,
        doneById: staff.id,
        doneAt: new Date(),
      },
    });
    if (res.count === 0) return { error: "This callback was already closed or does not exist." };
  } catch (err) {
    console.error("[portal] mark callback done failed", err);
    return { error: "Could not save. Please try again." };
  }
  revalidatePath("/portal/callbacks");
  return { ok: true };
}
