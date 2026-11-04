import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialAgentState, type AgentState } from "@/contracts";
import type { ToolContext } from "@/lib/services";
import { startTestDb, type TestDb } from "../support/pglite-db";
import { testDb } from "../support/db-mock";
import { createTestCall, seedTestClinic, type SeededClinic } from "../support/seed-test";
import { dhaka } from "../support/clinic-fixture";

vi.mock("@/lib/db", () => import("../support/db-mock"));

const {
  bookAppointment,
  cancelAppointment,
  checkAvailability,
  createCallback,
  findAppointments,
  getClinicInfo,
  loadClinicContext,
  logEvent,
  rescheduleAppointment,
} = await import("@/lib/services");
const { clearClinicCache } = await import("@/lib/services/clinic");

const NOW = dhaka("2026-11-04T09:00");
let t: TestDb;
let seeded: SeededClinic;
let nusrat: string;
let tanvir: string;

const confirmedState = (phone = "01712345678", name = "শরীফ উদ্দিন"): AgentState => ({
  ...createInitialAgentState(),
  patient: { nameBn: name, nameEn: "Sharif Uddin", nameConfirmed: true },
  phone: { raw: phone, valid: true, confirmed: true, tries: 0 },
});

async function ctx(state: AgentState = confirmedState()): Promise<ToolContext> {
  return {
    callId: await createTestCall(t.prisma, seeded.clinic.id),
    clinicId: seeded.clinic.id,
    now: NOW,
    state,
  };
}

beforeAll(async () => {
  t = await startTestDb();
  testDb.prisma = t.prisma;
  seeded = await seedTestClinic(t.prisma);
  nusrat = seeded.doctorIds["nusrat-jahan"]!;
  tanvir = seeded.doctorIds["tanvir-ahmed"]!;
}, 60_000);
afterAll(async () => {
  await t?.stop();
});
beforeEach(() => clearClinicCache());

const SUN_18 = "2026-11-08T18:00:00+06:00";
const book = (c: ToolContext, slotStart = SUN_18, doctorId = nusrat) =>
  bookAppointment(c, {
    slotStart,
    doctorId,
    serviceCode: "checkup",
    reason: "দাঁত ব্যথা",
    callerConfirmed: true,
  });

describe("loadClinicContext / getClinicInfo (FR-C10)", () => {
  it("loads by slug and id with doctors, schedules and services", async () => {
    const bySlug = await loadClinicContext("dhaka-dental-care");
    const byId = await loadClinicContext(seeded.clinic.id);
    expect(bySlug.id).toBe(byId.id);
    expect(bySlug.doctors).toHaveLength(3);
    expect(bySlug.doctors.find((d) => d.code === "nusrat-jahan")?.schedule).toHaveLength(6);
    expect(bySlug.services.map((s) => s.code)).toContain("root_canal");
    expect(bySlug.settings.prayerBreak.start).toBe("13:30");
  });
  it("hours say Friday is closed (AT-5)", async () => {
    const c = await ctx();
    const r = await getClinicInfo(c, { topic: "hours" });
    expect(r.factsBn).toContain("শুক্রবার বন্ধ");
    expect(r.factsBn).toContain("শনিবার থেকে বৃহস্পতিবার");
  });
  it("fees include root canal from 8,000 (AT-5)", async () => {
    const r = await getClinicInfo(await ctx(), { topic: "fees" });
    expect(r.factsBn).toContain("রুট ক্যানাল ৮,০০০ টাকা থেকে শুরু");
  });
});

describe("book_appointment (T1.4, FR-C6, FR-C18, FR-C19)", () => {
  it("AT-1: books, upserts patient, writes history, links call", async () => {
    const c = await ctx();
    const r = await book(c);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spokenSummaryBn).toContain("রবিবার, আট নভেম্বর, সন্ধ্যা ছয়টা");
    const appt = await t.prisma.appointment.findUniqueOrThrow({
      where: { id: r.appointmentId },
      include: { patient: true, history: true },
    });
    expect(appt.patient.phoneE164).toBe("+8801712345678");
    expect(appt.patient.fullNameBn).toBe("শরীফ উদ্দিন");
    expect(appt.history.map((h) => h.action)).toEqual(["created"]);
    expect(appt.createdByCallId).toBe(c.callId);
    expect(appt.slotEnd.getTime() - appt.slotStart.getTime()).toBe(30 * 60_000);
    const call = await t.prisma.call.findUniqueOrThrow({ where: { id: c.callId } });
    expect(call.patientId).toBe(appt.patientId);
  });

  it("AT-13: same slot again is slot_taken with alternatives (DB unique index)", async () => {
    const r = await book(await ctx(confirmedState("01811111111", "রহিম")));
    expect(r).toMatchObject({ ok: false, error: "slot_taken" });
    if (r.ok) return;
    expect(r.alternatives?.length).toBeGreaterThan(0);
    expect(r.alternatives?.map((a) => a.start)).not.toContain(SUN_18);
  });

  it("raw DB insert of a second active appointment fails (partial unique index)", async () => {
    const p = await t.prisma.patient.findFirstOrThrow();
    // Inside a transaction: PGlite's socket drops the connection on a failed single statement.
    await expect(
      t.prisma.$transaction((tx) =>
        tx.appointment.create({
          data: {
            clinicId: seeded.clinic.id,
            patientId: p.id,
            doctorId: nusrat,
            slotStart: new Date(SUN_18),
            slotEnd: new Date(SUN_18),
          },
        }),
      ),
    ).rejects.toThrow(/unique|P2002|23505/i);
  });

  it("check_availability no longer offers the booked slot", async () => {
    const r = await checkAvailability(await ctx(), { isoDate: "2026-11-08", time: "18:00" });
    expect(r.slots.map((s) => s.start)).not.toContain(SUN_18);
  });

  it("rejects without callerConfirmed (FR-C18)", async () => {
    const c = await ctx();
    const r = await bookAppointment(c, {
      slotStart: SUN_18,
      doctorId: nusrat,
      serviceCode: "checkup",
      reason: "",
      callerConfirmed: false as unknown as true,
    });
    expect(r).toEqual({ ok: false, error: "need_confirmation" });
  });

  it("rejects when the phone is not confirmed", async () => {
    const s = confirmedState();
    s.phone!.confirmed = false;
    expect(await book(await ctx(s), "2026-11-08T17:00:00+06:00")).toEqual({
      ok: false,
      error: "need_confirmation",
    });
  });

  it("rejects when the name is not confirmed", async () => {
    const s = confirmedState();
    s.patient!.nameConfirmed = false;
    expect(await book(await ctx(s), "2026-11-08T17:00:00+06:00")).toEqual({
      ok: false,
      error: "need_confirmation",
    });
  });

  it("AT-11: rejects an invalid phone (10 digits)", async () => {
    expect(
      await book(await ctx(confirmedState("0171234567")), "2026-11-08T17:00:00+06:00"),
    ).toEqual({ ok: false, error: "invalid_phone" });
  });

  it("rejects missing name and missing phone", async () => {
    const noName = { ...confirmedState(), patient: undefined };
    expect(await book(await ctx(noName))).toEqual({ ok: false, error: "missing_name" });
    const noPhone = { ...confirmedState(), phone: undefined };
    expect(await book(await ctx(noPhone))).toEqual({ ok: false, error: "missing_phone" });
  });

  it("rejects Friday, prayer break and misaligned slots as invalid_slot", async () => {
    const c = await ctx();
    expect((await book(c, "2026-11-06T18:00:00+06:00")).ok).toBe(false);
    expect(await book(c, "2026-11-08T14:00:00+06:00")).toMatchObject({
      ok: false,
      error: "invalid_slot",
    });
    expect(await book(c, "2026-11-08T18:10:00+06:00")).toMatchObject({
      ok: false,
      error: "invalid_slot",
    });
  });

  it("braces with a general dentist is not_allowed", async () => {
    const r = await bookAppointment(await ctx(), {
      slotStart: "2026-11-07T17:00:00+06:00",
      doctorId: nusrat,
      serviceCode: "braces_consultation",
      reason: "",
      callerConfirmed: true,
    });
    expect(r).toEqual({ ok: false, error: "not_allowed" });
  });

  it("braces with the orthodontist works", async () => {
    const r = await bookAppointment(await ctx(confirmedState("01911111111", "তাসনিম আক্তার মিম")), {
      slotStart: "2026-11-07T17:00:00+06:00",
      doctorId: tanvir,
      serviceCode: "braces_consultation",
      reason: "braces",
      callerConfirmed: true,
    });
    expect(r.ok).toBe(true);
  });
});

describe("find / reschedule / cancel in a later call (T1.4, FR-C7, FR-C8, AT-3, AT-4)", () => {
  it("finds only the caller's own appointments", async () => {
    const mine = await findAppointments(await ctx(), {});
    expect(mine.appointments).toHaveLength(1);
    expect(mine.appointments[0]?.slotStart).toBe(SUN_18);
    expect(mine.appointments[0]?.spokenBn).toContain("ডা. নুসরাত জাহান");
    const other = await findAppointments(await ctx(), { phoneRaw: "01911111111" });
    expect(other).toEqual({ appointments: [], error: "invalid_phone" });
    const none = await findAppointments(await ctx({ ...createInitialAgentState() }), {});
    expect(none.error).toBe("missing_phone");
  });

  it("accepts Bangla digits and +880 in phoneRaw when it is the same number", async () => {
    const r = await findAppointments(await ctx(), { phoneRaw: "+৮৮০ ১৭১২-৩৪৫৬৭৮" });
    expect(r.appointments).toHaveLength(1);
  });

  it("another caller cannot reschedule or cancel it", async () => {
    const id = (await findAppointments(await ctx(), {})).appointments[0]!.appointmentId;
    const c = await ctx(confirmedState("01911111111", "তাসনিম"));
    expect(await cancelAppointment(c, { appointmentId: id, callerConfirmed: true })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(
      await rescheduleAppointment(c, {
        appointmentId: id,
        newSlotStart: "2026-11-09T18:00:00+06:00",
        callerConfirmed: true,
      }),
    ).toEqual({ ok: false, error: "not_found" });
  });

  it("AT-3: reschedules with a history row and frees the old slot", async () => {
    const id = (await findAppointments(await ctx(), {})).appointments[0]!.appointmentId;
    const c = await ctx();
    const r = await rescheduleAppointment(c, {
      appointmentId: id,
      newSlotStart: "2026-11-09T18:00:00+06:00",
      callerConfirmed: true,
    });
    expect(r.ok).toBe(true);
    const a = await t.prisma.appointment.findUniqueOrThrow({
      where: { id },
      include: { history: { orderBy: { at: "asc" } } },
    });
    expect(a.status).toBe("rescheduled");
    expect(a.updatedByCallId).toBe(c.callId);
    expect(a.history.map((h) => h.action)).toEqual(["created", "rescheduled"]);
    expect(a.history[1]?.fromSlot?.toISOString()).toBe(new Date(SUN_18).toISOString());
    const avail = await checkAvailability(await ctx(), { isoDate: "2026-11-08", time: "18:00" });
    expect(avail.slots[0]?.start).toBe(SUN_18);
  });

  it("reschedule onto a taken slot is slot_taken", async () => {
    const id = (await findAppointments(await ctx(), {})).appointments[0]!.appointmentId;
    await book(await ctx(confirmedState("01311111111", "করিম")), "2026-11-10T18:00:00+06:00");
    const r = await rescheduleAppointment(await ctx(), {
      appointmentId: id,
      newSlotStart: "2026-11-10T18:00:00+06:00",
      callerConfirmed: true,
    });
    expect(r).toMatchObject({ ok: false, error: "slot_taken" });
  });

  it("AT-4: cancels, history row, slot free again, no longer found", async () => {
    const id = (await findAppointments(await ctx(), {})).appointments[0]!.appointmentId;
    const r = await cancelAppointment(await ctx(), { appointmentId: id, callerConfirmed: true });
    expect(r.ok).toBe(true);
    const a = await t.prisma.appointment.findUniqueOrThrow({
      where: { id },
      include: { history: true },
    });
    expect(a.status).toBe("cancelled");
    expect(a.history.map((h) => h.action).sort()).toEqual(["cancelled", "created", "rescheduled"]);
    expect((await findAppointments(await ctx(), {})).appointments).toHaveLength(0);
    expect(
      (
        await book(
          await ctx(confirmedState("01511111111", "নতুন রোগী")),
          "2026-11-09T18:00:00+06:00",
        )
      ).ok,
    ).toBe(true);
  });
});

describe("create_callback and logEvent (FR-C13)", () => {
  it("creates a callback with the caller's name and phone; urgent forces urgent priority", async () => {
    const c = await ctx();
    const r = await createCallback(c, {
      category: "urgent",
      reason: "মুখ ফুলে গেছে",
      priority: "high",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const row = await t.prisma.callback.findUniqueOrThrow({ where: { id: r.callbackId } });
    expect(row).toMatchObject({
      phoneE164: "+8801712345678",
      priority: "urgent",
      callId: c.callId,
      status: "open",
    });
  });
  it("asks for missing name / phone", async () => {
    expect(
      await createCallback(await ctx({ ...createInitialAgentState() }), {
        category: "medical",
        reason: "x",
        priority: "normal",
      }),
    ).toEqual({ ok: false, error: "missing_name" });
  });
  it("logEvent writes a row and never throws", async () => {
    const c = await ctx();
    await logEvent(c.callId, "tool_call", { name: "check_availability", at: new Date(0) });
    expect(await t.prisma.callEvent.count({ where: { callId: c.callId } })).toBe(1);
    await expect(logEvent("not-a-uuid", "tool_call", {})).resolves.toBeUndefined();
  });
});
