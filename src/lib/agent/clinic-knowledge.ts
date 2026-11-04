/**
 * Compact clinic facts for the system prompt (SRS 2 section 7.3 note) and a local fallback for
 * get_clinic_info. Everything comes from ClinicContext (DB), never invented.
 */
import type { ClinicInfoTopic, GetClinicInfoOutput } from "@/contracts";
import { WEEKDAYS_BN, moneyToBn, timeToBn } from "@/lib/text/bangla-numbers";
import type { ClinicContext } from "@/lib/services";

const WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SPECIALTY: Record<string, string> = {
  general: "general dentist",
  orthodontist: "orthodontist (braces)",
  oral_surgeon: "oral surgeon (extraction, root canal)",
};

const hm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return { h: h ?? 0, m: m ?? 0 };
};
const timeBn = (s: string) => {
  const { h, m } = hm(s);
  return timeToBn(h, m);
};

/** "Sat, Mon, Wed 16:00-20:00; Sun 10:00-16:00" (same ranges grouped). */
export function scheduleText(schedule: ClinicContext["doctors"][number]["schedule"]): string {
  const groups = new Map<string, number[]>();
  const order = [6, 0, 1, 2, 3, 4, 5]; // Bangladesh week starts on Saturday
  for (const wd of order) {
    for (const s of schedule.filter((x) => x.weekday === wd)) {
      const k = `${s.start}-${s.end}`;
      groups.set(k, [...(groups.get(k) ?? []), wd]);
    }
  }
  return [...groups.entries()].map(([range, days]) => `${days.map((d) => WD_EN[d]).join(", ")} ${range}`).join("; ");
}

/** CLINIC FACTS block (English labels, Bangla values). */
export function renderClinicFacts(c: ClinicContext): string {
  const s = c.settings;
  const openDays = [6, 0, 1, 2, 3, 4, 5].filter((d) => s.openWeekdays.includes(d)).map((d) => WD_EN[d]);
  const closedDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !s.openWeekdays.includes(d)).map((d) => WD_EN[d]);
  const lines = [
    `Clinic: ${c.nameBn} (${c.nameEn})`,
    `Address: ${c.addressBn} (${c.addressEn}). Landmark: ${s.landmarkBn}`,
    `Directions: ${s.directionsBn}`,
    `Phone: ${c.phoneDisplay}`,
    `Hours: ${openDays.join(", ")} ${s.open}-${s.close}. Closed: ${closedDays.join(", ") || "none"}. Prayer break ${s.prayerBreak.start}-${s.prayerBreak.end} (no appointments). Slots every ${s.slotMinutes} minutes.`,
    "Doctors:",
    ...c.doctors.map(
      (d) => `- ${d.nameBn} (${d.nameEn}), ${SPECIALTY[d.specialty] ?? d.specialty}: ${scheduleText(d.schedule)}`,
    ),
    "Services and fees (BDT):",
    ...c.services.map((x) => `- ${x.nameBn} (${x.nameEn}, code ${x.code}): ${x.feeIsFrom ? "from " : ""}${x.feeBdtFrom} taka, about ${x.durationMin} min`),
    `Preparation: ${s.preparationBn}`,
    `Payment: ${s.paymentBn}`,
    `Parking: ${s.parkingBn}`,
  ];
  return lines.join("\n");
}

/** Short Bangla facts per topic (get_clinic_info fallback when the service is unavailable). */
export function localClinicInfo(c: ClinicContext, topic: ClinicInfoTopic): GetClinicInfoOutput {
  const s = c.settings;
  const open = [6, 0, 1, 2, 3, 4].filter((d) => s.openWeekdays.includes(d));
  const facts: Record<ClinicInfoTopic, () => string> = {
    hours: () =>
      `${WEEKDAYS_BN[open[0] ?? 6]} থেকে ${WEEKDAYS_BN[open[open.length - 1] ?? 4]}, ${timeBn(s.open)} থেকে ${timeBn(s.close)} পর্যন্ত খোলা। শুক্রবার বন্ধ। ${timeBn(s.prayerBreak.start)} থেকে ${timeBn(s.prayerBreak.end)} নামাজের বিরতি।`,
    address: () => `${c.addressBn}। ${s.landmarkBn}`,
    directions: () => s.directionsBn,
    services: () => c.services.map((x) => x.nameBn).join(", "),
    fees: () => c.services.map((x) => `${x.nameBn} ${moneyToBn(x.feeBdtFrom)}${x.feeIsFrom ? " থেকে" : ""}`).join(", "),
    doctors: () => c.doctors.map((d) => d.nameBn).join(", "),
    preparation: () => s.preparationBn,
    payment: () => s.paymentBn,
    parking: () => s.parkingBn,
  };
  return { topic, factsBn: facts[topic]().normalize("NFC") };
}
