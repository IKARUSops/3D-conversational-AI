/**
 * Clinic data for the agent: loadClinicContext (60 s cache) and get_clinic_info facts.
 * Facts come only from the clinic row and settings (FR-C10: never invent).
 */
import "server-only";
import {
  ClinicSettingsSchema,
  type ClinicInfoTopic,
  type GetClinicInfoInput,
  type GetClinicInfoOutput,
} from "@/contracts";
import { getDb } from "@/lib/db";
import type { ClinicContext, ToolContext } from "@/lib/services";
import { buildClinicInfo } from "./clinic-info";

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: ClinicContext }>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Load clinic + active doctors + schedules + active services. Cached 60 s per id and slug. */
export async function loadClinicContext(clinicIdOrSlug: string): Promise<ClinicContext> {
  const hit = cache.get(clinicIdOrSlug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const clinic = await getDb().clinic.findFirst({
    where: UUID_RE.test(clinicIdOrSlug) ? { id: clinicIdOrSlug } : { slug: clinicIdOrSlug },
    include: {
      doctors: { where: { active: true }, include: { schedules: true }, orderBy: { code: "asc" } },
      services: { where: { active: true }, orderBy: { feeBdtFrom: "asc" } },
    },
  });
  if (!clinic) throw new Error(`clinic not found: ${clinicIdOrSlug}`);

  const value: ClinicContext = {
    id: clinic.id,
    slug: clinic.slug,
    nameBn: clinic.nameBn,
    nameEn: clinic.nameEn,
    timezone: clinic.timezone,
    addressBn: clinic.addressBn ?? "",
    addressEn: clinic.addressEn ?? "",
    phoneDisplay: clinic.phoneDisplay ?? "",
    settings: ClinicSettingsSchema.parse(clinic.settings),
    doctors: clinic.doctors.map((d) => ({
      id: d.id,
      code: d.code,
      nameBn: d.nameBn,
      nameEn: d.nameEn,
      specialty: d.specialty,
      schedule: d.schedules
        .map((s) => ({ weekday: s.weekday, start: s.startTime, end: s.endTime }))
        .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)),
    })),
    services: clinic.services.map((s) => ({
      code: s.code,
      nameBn: s.nameBn,
      nameEn: s.nameEn,
      durationMin: s.durationMin,
      feeBdtFrom: s.feeBdtFrom,
      feeIsFrom: s.feeIsFrom,
      specialtyRequired: s.specialtyRequired,
    })),
  };
  const entry = { at: Date.now(), value };
  cache.set(value.id, entry);
  cache.set(value.slug, entry);
  return value;
}

/** Clear the clinic cache (tests, or after a settings change). */
export function clearClinicCache(): void {
  cache.clear();
}

export async function getClinicInfo(
  ctx: ToolContext,
  input: GetClinicInfoInput,
): Promise<GetClinicInfoOutput> {
  const clinic = await loadClinicContext(ctx.clinicId);
  const topic: ClinicInfoTopic = input.topic;
  return { topic, factsBn: buildClinicInfo(clinic, topic) };
}
