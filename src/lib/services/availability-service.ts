/** DB wrapper for check_availability (SRS 2 section 7.6). The rules are in availability.ts. */
import "server-only";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  type CheckAvailabilityInput,
  type CheckAvailabilityOutput,
} from "@/contracts";
import { getDb } from "@/lib/db";
import type { ToolContext } from "@/lib/services";
import { busyQueryRange, computeSlots, type BusySlot } from "./availability";
import { loadClinicContext } from "./clinic";

/** Active appointments of a clinic in [from, to). */
export async function loadBusy(clinicId: string, from: Date, to: Date): Promise<BusySlot[]> {
  const rows = await getDb().appointment.findMany({
    where: {
      clinicId,
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      slotStart: { gte: from, lt: to },
    },
    select: { doctorId: true, slotStart: true },
  });
  return rows.map((r) => ({ doctorId: r.doctorId, start: r.slotStart }));
}

export async function checkAvailability(
  ctx: ToolContext,
  input: CheckAvailabilityInput,
): Promise<CheckAvailabilityOutput> {
  const clinic = await loadClinicContext(ctx.clinicId);
  const { from, to } = busyQueryRange(input.isoDate, ctx.now);
  const busy = await loadBusy(clinic.id, from, to);
  return computeSlots({ clinic, busy, now: ctx.now, ...input });
}
