/**
 * Booking tools (SRS 2 sections 7.3 and 7.6; FR-C6, FR-C7, FR-C8, FR-C18, FR-C19).
 *
 * - Every write is one Prisma transaction with an appointment_history row.
 * - Double booking is stopped by the partial unique index (0002 migration); a unique violation
 *   becomes `slot_taken` with up to 3 alternatives.
 * - Callers can only see and change appointments of their own confirmed phone.
 */
import "server-only";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  type BookAppointmentInput,
  type BookAppointmentOutput,
  type BookingError,
  type BookingResult,
  type CancelAppointmentInput,
  type CancelAppointmentOutput,
  type FindAppointmentsInput,
  type FindAppointmentsOutput,
  type RescheduleAppointmentInput,
  type RescheduleAppointmentOutput,
  type ServiceCode,
  type SlotOffer,
} from "@/contracts";
import { getDb } from "@/lib/db";
import type { ClinicContext, ToolContext } from "@/lib/services";
import { busyQueryRange, computeSlots, isValidSlot } from "./availability";
import { loadBusy } from "./availability-service";
import { loadClinicContext } from "./clinic";
import { callerIdentity, isUniqueViolation } from "./identity";
import { spokenDateTimeBn } from "./spoken-bn";
import { toDhakaIso, toLocal } from "./time";
import { checkBdPhone } from "./validate";

const fail = (error: BookingError, alternatives?: SlotOffer[]): BookingResult =>
  alternatives && alternatives.length > 0
    ? { ok: false, error, alternatives }
    : { ok: false, error };

/** Is this doctor allowed for this service (braces need an orthodontist)? */
export function doctorAllowed(
  clinic: ClinicContext,
  doctorId: string,
  serviceCode?: ServiceCode,
): boolean {
  const doctor = clinic.doctors.find((d) => d.id === doctorId);
  if (!doctor) return false;
  if (serviceCode === "braces_consultation") return doctor.specialty === "orthodontist";
  return true;
}

async function alternativesFor(
  clinic: ClinicContext,
  start: Date,
  now: Date,
  serviceCode?: ServiceCode,
): Promise<SlotOffer[]> {
  try {
    const l = toLocal(start);
    const { from, to } = busyQueryRange(l.isoDate, now);
    const busy = await loadBusy(clinic.id, from, to);
    const time = `${String(Math.floor(l.minutes / 60)).padStart(2, "0")}:${String(l.minutes % 60).padStart(2, "0")}`;
    return computeSlots({ clinic, busy, now, isoDate: l.isoDate, time, serviceCode }).slots;
  } catch {
    return [];
  }
}

function parseSlot(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function summaryBn(
  prefix: string,
  start: Date,
  doctorNameBn: string,
  serviceNameBn?: string,
): string {
  const svc = serviceNameBn ? `, ${serviceNameBn}` : "";
  return `${prefix}: ${spokenDateTimeBn(start)}, ${doctorNameBn}${svc}।`;
}

/** book_appointment (FR-C6, FR-C18, FR-C19). */
export async function bookAppointment(
  ctx: ToolContext,
  input: BookAppointmentInput,
): Promise<BookAppointmentOutput> {
  if ((input.callerConfirmed as unknown) !== true) return fail("need_confirmation");
  const who = callerIdentity(ctx.state, { requireName: true });
  if (!who.ok) return fail(who.error);

  const clinic = await loadClinicContext(ctx.clinicId);
  const start = parseSlot(input.slotStart);
  const doctor = clinic.doctors.find((d) => d.id === input.doctorId);
  const service = clinic.services.find((s) => s.code === input.serviceCode);
  if (!start || !doctor) return fail("invalid_slot");
  if (!doctorAllowed(clinic, doctor.id, input.serviceCode)) return fail("not_allowed");
  if (!isValidSlot(clinic, doctor.id, start, ctx.now)) {
    return fail("invalid_slot", await alternativesFor(clinic, start, ctx.now, input.serviceCode));
  }
  const durationMin = service?.durationMin ?? clinic.settings.slotMinutes;
  const end = new Date(start.getTime() + durationMin * 60_000);

  try {
    const appt = await getDb().$transaction(async (tx) => {
      const svcRow = await tx.service.findUnique({
        where: { clinicId_code: { clinicId: clinic.id, code: input.serviceCode } },
        select: { id: true },
      });
      const patient = await tx.patient.upsert({
        where: { clinicId_phoneE164: { clinicId: clinic.id, phoneE164: who.e164 } },
        create: {
          clinicId: clinic.id,
          phoneE164: who.e164,
          fullNameBn: who.nameBn,
          fullNameEn: who.nameEn,
        },
        update: {
          ...(who.nameBn ? { fullNameBn: who.nameBn } : {}),
          ...(who.nameEn ? { fullNameEn: who.nameEn } : {}),
        },
      });
      const created = await tx.appointment.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: svcRow?.id ?? null,
          slotStart: start,
          slotEnd: end,
          status: "booked",
          reason: input.reason || null,
          createdByCallId: ctx.callId,
        },
      });
      await tx.appointmentHistory.create({
        data: { appointmentId: created.id, callId: ctx.callId, action: "created", toSlot: start },
      });
      await tx.call.update({ where: { id: ctx.callId }, data: { patientId: patient.id } });
      return created;
    });
    return {
      ok: true,
      appointmentId: appt.id,
      spokenSummaryBn: summaryBn(
        "অ্যাপয়েন্টমেন্ট বুক হয়েছে",
        start,
        doctor.nameBn,
        service?.nameBn,
      ),
    };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail("slot_taken", await alternativesFor(clinic, start, ctx.now, input.serviceCode));
    }
    throw err;
  }
}

/** find_appointments: upcoming active appointments of the caller's own confirmed phone only. */
export async function findAppointments(
  ctx: ToolContext,
  input: FindAppointmentsInput,
): Promise<FindAppointmentsOutput> {
  const who = callerIdentity(ctx.state, { requireName: false });
  if (!who.ok) {
    if (who.error === "invalid_phone") return { appointments: [], error: "invalid_phone" };
    return { appointments: [], error: "missing_phone" };
  }
  // A different number than the confirmed one is never searched (privacy, SRS 2 section 10).
  if (input.phoneRaw) {
    const asked = checkBdPhone(input.phoneRaw);
    if (!asked.valid || asked.e164 !== who.e164)
      return { appointments: [], error: "invalid_phone" };
  }
  const rows = await getDb().appointment.findMany({
    where: {
      clinicId: ctx.clinicId,
      patient: { phoneE164: who.e164 },
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      slotStart: { gte: ctx.now },
    },
    include: { doctor: true, service: true },
    orderBy: { slotStart: "asc" },
    take: 5,
  });
  return {
    appointments: rows.map((a) => ({
      appointmentId: a.id,
      slotStart: toDhakaIso(a.slotStart),
      doctorNameBn: a.doctor.nameBn,
      ...(a.service ? { serviceNameBn: a.service.nameBn } : {}),
      status: a.status,
      spokenBn: `${spokenDateTimeBn(a.slotStart)}, ${a.doctor.nameBn}${a.service ? `, ${a.service.nameBn}` : ""}`,
    })),
  };
}

/** Active, upcoming appointment owned by the caller's phone, or null. */
async function ownedAppointment(ctx: ToolContext, appointmentId: string, e164: string) {
  if (!/^[0-9a-f-]{36}$/i.test(appointmentId)) return null;
  const a = await getDb().appointment.findFirst({
    where: {
      id: appointmentId,
      clinicId: ctx.clinicId,
      patient: { phoneE164: e164 },
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      slotStart: { gte: ctx.now },
    },
    include: { service: true, doctor: true },
  });
  return a;
}

/** reschedule_appointment (FR-C7). */
export async function rescheduleAppointment(
  ctx: ToolContext,
  input: RescheduleAppointmentInput,
): Promise<RescheduleAppointmentOutput> {
  if ((input.callerConfirmed as unknown) !== true) return fail("need_confirmation");
  const who = callerIdentity(ctx.state, { requireName: false });
  if (!who.ok) return fail(who.error);
  const appt = await ownedAppointment(ctx, input.appointmentId, who.e164);
  if (!appt) return fail("not_found");

  const clinic = await loadClinicContext(ctx.clinicId);
  const start = parseSlot(input.newSlotStart);
  const doctorId = input.newDoctorId ?? appt.doctorId;
  const doctor = clinic.doctors.find((d) => d.id === doctorId);
  const serviceCode = appt.service?.code as ServiceCode | undefined;
  if (!start || !doctor) return fail("invalid_slot");
  if (!doctorAllowed(clinic, doctor.id, serviceCode)) return fail("not_allowed");
  if (!isValidSlot(clinic, doctor.id, start, ctx.now)) {
    return fail("invalid_slot", await alternativesFor(clinic, start, ctx.now, serviceCode));
  }
  const durationMin = appt.service?.durationMin ?? clinic.settings.slotMinutes;

  try {
    await getDb().$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appt.id },
        data: {
          slotStart: start,
          slotEnd: new Date(start.getTime() + durationMin * 60_000),
          doctorId: doctor.id,
          status: "rescheduled",
          updatedByCallId: ctx.callId,
        },
      });
      await tx.appointmentHistory.create({
        data: {
          appointmentId: appt.id,
          callId: ctx.callId,
          action: "rescheduled",
          fromSlot: appt.slotStart,
          toSlot: start,
        },
      });
      await tx.call.update({ where: { id: ctx.callId }, data: { patientId: appt.patientId } });
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail("slot_taken", await alternativesFor(clinic, start, ctx.now, serviceCode));
    }
    throw err;
  }
  return {
    ok: true,
    appointmentId: appt.id,
    spokenSummaryBn: summaryBn(
      "অ্যাপয়েন্টমেন্ট নতুন সময়ে সরানো হয়েছে",
      start,
      doctor.nameBn,
      appt.service?.nameBn,
    ),
  };
}

/** cancel_appointment (FR-C8). Frees the slot (partial index only covers active rows). */
export async function cancelAppointment(
  ctx: ToolContext,
  input: CancelAppointmentInput,
): Promise<CancelAppointmentOutput> {
  if ((input.callerConfirmed as unknown) !== true) return fail("need_confirmation");
  const who = callerIdentity(ctx.state, { requireName: false });
  if (!who.ok) return fail(who.error);
  const appt = await ownedAppointment(ctx, input.appointmentId, who.e164);
  if (!appt) return fail("not_found");

  await getDb().$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appt.id },
      data: { status: "cancelled", updatedByCallId: ctx.callId },
    });
    await tx.appointmentHistory.create({
      data: {
        appointmentId: appt.id,
        callId: ctx.callId,
        action: "cancelled",
        fromSlot: appt.slotStart,
      },
    });
    await tx.call.update({ where: { id: ctx.callId }, data: { patientId: appt.patientId } });
  });
  return {
    ok: true,
    appointmentId: appt.id,
    spokenSummaryBn: summaryBn(
      "অ্যাপয়েন্টমেন্ট বাতিল হয়েছে",
      appt.slotStart,
      appt.doctor.nameBn,
      appt.service?.nameBn,
    ),
  };
}
