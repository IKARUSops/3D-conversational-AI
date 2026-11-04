/** Seeds the PGlite test DB with the clinic from clinic-fixture (same data as prisma/seed.ts). */
import type { PrismaClient } from "@/generated/prisma/client";
import type { ClinicContext } from "@/lib/services";
import { clinicFixture } from "./clinic-fixture";

export interface SeededClinic {
  clinic: ClinicContext;
  doctorIds: Record<string, string>;
}

export async function seedTestClinic(prisma: PrismaClient): Promise<SeededClinic> {
  const f = clinicFixture();
  const c = await prisma.clinic.create({
    data: {
      slug: f.slug,
      nameBn: f.nameBn,
      nameEn: f.nameEn,
      addressBn: f.addressBn,
      addressEn: f.addressEn,
      phoneDisplay: f.phoneDisplay,
      settings: f.settings,
    },
  });
  const doctorIds: Record<string, string> = {};
  for (const d of f.doctors) {
    const row = await prisma.doctor.create({
      data: {
        clinicId: c.id,
        code: d.code,
        nameBn: d.nameBn,
        nameEn: d.nameEn,
        specialty: d.specialty as "general" | "orthodontist" | "oral_surgeon",
        schedules: {
          create: d.schedule.map((s) => ({
            weekday: s.weekday,
            startTime: s.start,
            endTime: s.end,
          })),
        },
      },
    });
    doctorIds[d.code] = row.id;
  }
  for (const s of f.services) {
    await prisma.service.create({
      data: {
        clinicId: c.id,
        code: s.code,
        nameBn: s.nameBn,
        nameEn: s.nameEn,
        durationMin: s.durationMin,
        feeBdtFrom: s.feeBdtFrom,
        feeIsFrom: s.feeIsFrom,
        specialtyRequired: s.specialtyRequired as "orthodontist" | "oral_surgeon" | null,
      },
    });
  }
  return { clinic: { ...f, id: c.id }, doctorIds };
}

export async function createTestCall(prisma: PrismaClient, clinicId: string): Promise<string> {
  const call = await prisma.call.create({
    data: { clinicId, sttProvider: "browser", ttsProvider: "elevenlabs" },
  });
  return call.id;
}
