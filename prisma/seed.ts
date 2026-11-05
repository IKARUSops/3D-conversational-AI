/**
 * Seed (SRS 2 section 6.3): clinic, doctors, schedules, services exactly as SRS 1 section 4.4,
 * plus the reviewer (admin, read-only settings) and one receptionist user.
 *
 * - Idempotent: safe to run many times (upserts; schedules are replaced per doctor).
 * - No fake calls. The portal is filled by real acceptance-test calls.
 * - Staff users are created with the Supabase admin API. If the Supabase env vars or the
 *   user email/password vars are missing, that part is skipped with a warning.
 *
 * Run: pnpm db:seed   (uses DIRECT_URL if set, else DATABASE_URL)
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PrismaClient, type Specialty, type StaffRole } from "../src/generated/prisma/client";
import type { ClinicSettings, ServiceCode } from "../src/contracts";

// JS getDay(): 0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu, 5 Fri (closed), 6 Sat
const SAT = 6,
  SUN = 0,
  MON = 1,
  TUE = 2,
  WED = 3,
  THU = 4;
const OPEN_DAYS = [SAT, SUN, MON, TUE, WED, THU];

const CLINIC = {
  slug: "dhaka-dental-care",
  nameBn: "ঢাকা ডেন্টাল কেয়ার",
  nameEn: "Dhaka Dental Care",
  timezone: "Asia/Dhaka",
  phoneDisplay: "+880 1700-000000",
  addressBn: "বাড়ি ১২, রোড ৭, ধানমন্ডি, ঢাকা ১২০৫",
  addressEn: "House 12, Road 7, Dhanmondi, Dhaka 1205",
} as const;

const SETTINGS: ClinicSettings = {
  openWeekdays: OPEN_DAYS,
  open: "10:00",
  close: "20:00",
  prayerBreak: { start: "13:30", end: "14:30" },
  slotMinutes: 30,
  leadMinutes: 30,
  landmarkBn: "ধানমন্ডি লেকের কাছে, শংকর বাস স্ট্যান্ড থেকে ৫ মিনিট",
  landmarkEn: "Near Dhanmondi Lake, 5 minutes from Shankar bus stand",
  directionsBn:
    "ধানমন্ডি রোড ৭, বাড়ি ১২। ধানমন্ডি লেকের কাছে, শংকর বাস স্ট্যান্ড থেকে হেঁটে ৫ মিনিট।",
  directionsEn:
    "House 12, Road 7, Dhanmondi. Near Dhanmondi Lake, a 5 minute walk from Shankar bus stand.",
  preparationBn:
    "পুরনো প্রেসক্রিপশন আর এক্স-রে সাথে আনবেন। সময়ের ১৫ মিনিট আগে আসবেন। স্কেলিং-এর আগে স্বাভাবিকভাবে খেয়ে আসতে পারেন। দাঁত তোলার আগে হালকা খাবার খেয়ে আসবেন, আর ডাক্তার না বললে অ্যাসপিরিন খাবেন না।",
  preparationEn:
    "Bring old prescriptions and X-rays. Arrive 15 minutes early. Eat normally before scaling. For extraction, eat a light meal before and avoid aspirin unless your doctor says otherwise.",
  paymentBn: "ক্যাশ, বিকাশ আর কার্ডে পেমেন্ট করা যায়।",
  paymentEn: "Cash, bKash and card.",
  parkingBn: "পার্কিং সীমিত; রিকশা আর সিএনজি গেটে নামিয়ে দিতে পারে।",
  parkingEn: "Limited parking; rickshaw and CNG drop-off at the gate.",
  defaultStt: "elevenlabs",
  defaultTts: "elevenlabs",
};

interface DoctorSeed {
  code: string;
  nameBn: string;
  nameEn: string;
  specialty: Specialty;
  weekdays: number[];
  start: string;
  end: string;
}

const DOCTORS: DoctorSeed[] = [
  {
    code: "nusrat-jahan",
    nameBn: "ডা. নুসরাত জাহান",
    nameEn: "Dr. Nusrat Jahan",
    specialty: "general",
    weekdays: OPEN_DAYS,
    start: "10:00",
    end: "20:00",
  },
  {
    code: "tanvir-ahmed",
    nameBn: "ডা. তানভীর আহমেদ",
    nameEn: "Dr. Tanvir Ahmed",
    specialty: "orthodontist",
    weekdays: [SAT, MON, WED],
    start: "16:00",
    end: "20:00",
  },
  {
    code: "farhana-islam",
    nameBn: "ডা. ফারহানা ইসলাম",
    nameEn: "Dr. Farhana Islam",
    specialty: "oral_surgeon",
    weekdays: [SUN, TUE, THU],
    start: "10:00",
    end: "16:00",
  },
];

interface ServiceSeed {
  code: ServiceCode;
  nameBn: string;
  nameEn: string;
  feeBdtFrom: number;
  feeIsFrom: boolean;
  specialtyRequired: Specialty | null;
}

// Fees in BDT (illustrative), SRS 1 section 4.4. Root canal / extraction: oral surgeon first,
// general dentist if no surgeon slot that day (rule lives in services/availability.ts).
const SERVICES: ServiceSeed[] = [
  {
    code: "checkup",
    nameBn: "কনসালটেশন / চেক-আপ",
    nameEn: "Consultation / check-up",
    feeBdtFrom: 500,
    feeIsFrom: false,
    specialtyRequired: null,
  },
  {
    code: "scaling",
    nameBn: "স্কেলিং ও পলিশিং",
    nameEn: "Scaling and polishing",
    feeBdtFrom: 1500,
    feeIsFrom: false,
    specialtyRequired: null,
  },
  {
    code: "filling",
    nameBn: "ফিলিং",
    nameEn: "Filling",
    feeBdtFrom: 2000,
    feeIsFrom: true,
    specialtyRequired: null,
  },
  {
    code: "root_canal",
    nameBn: "রুট ক্যানাল",
    nameEn: "Root canal",
    feeBdtFrom: 8000,
    feeIsFrom: true,
    specialtyRequired: "oral_surgeon",
  },
  {
    code: "extraction",
    nameBn: "দাঁত তোলা (এক্সট্র্যাকশন)",
    nameEn: "Extraction",
    feeBdtFrom: 1000,
    feeIsFrom: true,
    specialtyRequired: "oral_surgeon",
  },
  {
    code: "braces_consultation",
    nameBn: "ব্রেসেস কনসালটেশন",
    nameEn: "Braces consultation",
    feeBdtFrom: 1000,
    feeIsFrom: false,
    specialtyRequired: "orthodontist",
  },
  {
    code: "xray",
    nameBn: "এক্স-রে",
    nameEn: "X-ray",
    feeBdtFrom: 300,
    feeIsFrom: false,
    specialtyRequired: null,
  },
];

function makePrisma(): PrismaClient {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Set DIRECT_URL or DATABASE_URL in .env before seeding");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) });
}

async function seedClinic(prisma: PrismaClient): Promise<string> {
  const clinic = await prisma.clinic.upsert({
    where: { slug: CLINIC.slug },
    create: { ...CLINIC, settings: SETTINGS },
    update: { ...CLINIC, settings: SETTINGS },
  });

  for (const d of DOCTORS) {
    const doctor = await prisma.doctor.upsert({
      where: { clinicId_code: { clinicId: clinic.id, code: d.code } },
      create: {
        clinicId: clinic.id,
        code: d.code,
        nameBn: d.nameBn,
        nameEn: d.nameEn,
        specialty: d.specialty,
        active: true,
      },
      update: { nameBn: d.nameBn, nameEn: d.nameEn, specialty: d.specialty, active: true },
    });
    await prisma.$transaction([
      prisma.doctorSchedule.deleteMany({ where: { doctorId: doctor.id } }),
      prisma.doctorSchedule.createMany({
        data: d.weekdays.map((weekday) => ({
          doctorId: doctor.id,
          weekday,
          startTime: d.start,
          endTime: d.end,
        })),
      }),
    ]);
  }

  for (const s of SERVICES) {
    const data = {
      nameBn: s.nameBn,
      nameEn: s.nameEn,
      durationMin: 30,
      feeBdtFrom: s.feeBdtFrom,
      feeIsFrom: s.feeIsFrom,
      specialtyRequired: s.specialtyRequired,
      active: true,
    };
    await prisma.service.upsert({
      where: { clinicId_code: { clinicId: clinic.id, code: s.code } },
      create: { clinicId: clinic.id, code: s.code, ...data },
      update: data,
    });
  }
  console.log(`clinic ${CLINIC.slug}: ${DOCTORS.length} doctors, ${SERVICES.length} services`);
  return clinic.id;
}

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureAuthUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (!created.error && created.data.user) return created.data.user.id;

  const existingId = await findUserIdByEmail(admin, email);
  if (!existingId) throw created.error ?? new Error(`Could not create ${email}`);
  const updated = await admin.auth.admin.updateUserById(existingId, {
    password,
    email_confirm: true,
  });
  if (updated.error) throw updated.error;
  return existingId;
}

/** Private bucket for caller recordings (SRS 1 section 5.3). Idempotent. */
async function ensureRecordingsBucket(admin: SupabaseClient): Promise<void> {
  const { data } = await admin.storage.getBucket("recordings");
  if (data) {
    if (data.public) await admin.storage.updateBucket("recordings", { public: false });
    console.log("storage bucket recordings: exists (private)");
    return;
  }
  const { error } = await admin.storage.createBucket("recordings", { public: false });
  if (error) console.warn(`WARN: could not create bucket recordings: ${error.message}`);
  else console.log("storage bucket recordings: created (private)");
}

async function seedStaff(prisma: PrismaClient, clinicId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.warn(
      "WARN: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing; skipping staff users",
    );
    return;
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await ensureRecordingsBucket(admin);

  const users: {
    email?: string;
    password?: string;
    role: StaffRole;
    name: string;
    readOnly: boolean;
    label: string;
  }[] = [
    // Reviewer is admin but cannot edit BYOK keys (SRS 1 section 3).
    {
      email: process.env.REVIEWER_EMAIL,
      password: process.env.REVIEWER_PASSWORD,
      role: "admin",
      name: "StrategyByte Reviewer",
      readOnly: true,
      label: "REVIEWER",
    },
    {
      email: process.env.RECEPTIONIST_EMAIL,
      password: process.env.RECEPTIONIST_PASSWORD,
      role: "receptionist",
      name: "Receptionist",
      readOnly: false,
      label: "RECEPTIONIST",
    },
  ];

  for (const u of users) {
    if (!u.email || !u.password) {
      console.warn(`WARN: ${u.label}_EMAIL / ${u.label}_PASSWORD missing; skipping ${u.role} user`);
      continue;
    }
    const id = await ensureAuthUser(admin, u.email, u.password);
    await prisma.staffUser.upsert({
      where: { id },
      create: { id, clinicId, email: u.email, role: u.role, name: u.name, readOnly: u.readOnly },
      update: { clinicId, email: u.email, role: u.role, name: u.name, readOnly: u.readOnly },
    });
    console.log(`staff user ${u.role}: ${u.email}`);
  }
}

async function main(): Promise<void> {
  const prisma = makePrisma();
  try {
    const clinicId = await seedClinic(prisma);
    await seedStaff(prisma, clinicId);
    console.log("seed done");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("seed failed:", err);
  process.exit(1);
});
