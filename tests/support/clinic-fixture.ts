/** Clinic context equal to prisma/seed.ts (SRS 1 section 4.4), for unit tests. */
import type { ClinicContext } from "@/lib/services";

const OPEN = [6, 0, 1, 2, 3, 4];
const sched = (days: number[], start: string, end: string) =>
  days.map((weekday) => ({ weekday, start, end }));

export const DR_NUSRAT = "doc-nusrat";
export const DR_TANVIR = "doc-tanvir";
export const DR_FARHANA = "doc-farhana";

export function clinicFixture(): ClinicContext {
  return {
    id: "clinic-1",
    slug: "dhaka-dental-care",
    nameBn: "ঢাকা ডেন্টাল কেয়ার",
    nameEn: "Dhaka Dental Care",
    timezone: "Asia/Dhaka",
    addressBn: "বাড়ি ১২, রোড ৭, ধানমন্ডি, ঢাকা ১২০৫",
    addressEn: "House 12, Road 7, Dhanmondi, Dhaka 1205",
    phoneDisplay: "+880 1700-000000",
    settings: {
      openWeekdays: OPEN,
      open: "10:00",
      close: "20:00",
      prayerBreak: { start: "13:30", end: "14:30" },
      slotMinutes: 30,
      leadMinutes: 30,
      landmarkBn: "ধানমন্ডি লেকের কাছে",
      landmarkEn: "Near Dhanmondi Lake",
      directionsBn: "ধানমন্ডি রোড ৭, বাড়ি ১২।",
      directionsEn: "House 12, Road 7, Dhanmondi.",
      preparationBn: "সময়ের ১৫ মিনিট আগে আসবেন।",
      preparationEn: "Arrive 15 minutes early.",
      paymentBn: "ক্যাশ, বিকাশ আর কার্ডে পেমেন্ট করা যায়।",
      paymentEn: "Cash, bKash and card.",
      parkingBn: "পার্কিং সীমিত।",
      parkingEn: "Limited parking.",
      defaultStt: "browser",
      defaultTts: "elevenlabs",
    },
    doctors: [
      {
        id: DR_NUSRAT,
        code: "nusrat-jahan",
        nameBn: "ডা. নুসরাত জাহান",
        nameEn: "Dr. Nusrat Jahan",
        specialty: "general",
        schedule: sched(OPEN, "10:00", "20:00"),
      },
      {
        id: DR_TANVIR,
        code: "tanvir-ahmed",
        nameBn: "ডা. তানভীর আহমেদ",
        nameEn: "Dr. Tanvir Ahmed",
        specialty: "orthodontist",
        schedule: sched([6, 1, 3], "16:00", "20:00"),
      },
      {
        id: DR_FARHANA,
        code: "farhana-islam",
        nameBn: "ডা. ফারহানা ইসলাম",
        nameEn: "Dr. Farhana Islam",
        specialty: "oral_surgeon",
        schedule: sched([0, 2, 4], "10:00", "16:00"),
      },
    ],
    services: [
      {
        code: "checkup",
        nameBn: "কনসালটেশন / চেক-আপ",
        nameEn: "Consultation / check-up",
        durationMin: 30,
        feeBdtFrom: 500,
        feeIsFrom: false,
        specialtyRequired: null,
      },
      {
        code: "scaling",
        nameBn: "স্কেলিং ও পলিশিং",
        nameEn: "Scaling and polishing",
        durationMin: 30,
        feeBdtFrom: 1500,
        feeIsFrom: false,
        specialtyRequired: null,
      },
      {
        code: "filling",
        nameBn: "ফিলিং",
        nameEn: "Filling",
        durationMin: 30,
        feeBdtFrom: 2000,
        feeIsFrom: true,
        specialtyRequired: null,
      },
      {
        code: "root_canal",
        nameBn: "রুট ক্যানাল",
        nameEn: "Root canal",
        durationMin: 30,
        feeBdtFrom: 8000,
        feeIsFrom: true,
        specialtyRequired: "oral_surgeon",
      },
      {
        code: "extraction",
        nameBn: "দাঁত তোলা (এক্সট্র্যাকশন)",
        nameEn: "Extraction",
        durationMin: 30,
        feeBdtFrom: 1000,
        feeIsFrom: true,
        specialtyRequired: "oral_surgeon",
      },
      {
        code: "braces_consultation",
        nameBn: "ব্রেসেস কনসালটেশন",
        nameEn: "Braces consultation",
        durationMin: 30,
        feeBdtFrom: 1000,
        feeIsFrom: false,
        specialtyRequired: "orthodontist",
      },
      {
        code: "xray",
        nameBn: "এক্স-রে",
        nameEn: "X-ray",
        durationMin: 30,
        feeBdtFrom: 300,
        feeIsFrom: false,
        specialtyRequired: null,
      },
    ],
  };
}

/** Instant for Dhaka local "YYYY-MM-DDTHH:MM". */
export const dhaka = (local: string): Date => new Date(`${local}:00+06:00`);
