/** Pure: short Bangla facts per get_clinic_info topic, from clinic data only (FR-C10). */
import type { ClinicInfoTopic } from "@/contracts";
import type { ClinicContext } from "@/lib/services";
import { WEEKDAY_BN, spokenTimeBn, toBnDigits } from "./spoken-bn";
import { hhmmToMin } from "./time";

const SPECIALTY_BN: Record<string, string> = {
  general: "জেনারেল ডেন্টিস্ট",
  orthodontist: "অর্থোডন্টিস্ট (ব্রেসেস)",
  oral_surgeon: "ওরাল সার্জন (দাঁত তোলা, রুট ক্যানাল)",
};

/** Saturday-first order used in Bangladesh. */
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

const money = (n: number): string => `${toBnDigits(n.toLocaleString("en-IN"))} টাকা`;

function dayList(days: number[]): string {
  const sorted = WEEK_ORDER.filter((d) => days.includes(d));
  // Consecutive run (for example Saturday to Thursday).
  const idx = sorted.map((d) => WEEK_ORDER.indexOf(d));
  const consecutive = idx.length > 2 && idx.every((v, i) => i === 0 || v === (idx[i - 1] ?? 0) + 1);
  if (consecutive)
    return `${WEEKDAY_BN[sorted[0]!]} থেকে ${WEEKDAY_BN[sorted[sorted.length - 1]!]}`;
  return sorted.map((d) => WEEKDAY_BN[d]).join(", ");
}

const time = (hhmm: string): string => spokenTimeBn(hhmmToMin(hhmm));

export function hoursBn(c: ClinicContext): string {
  const s = c.settings;
  const closed = [0, 1, 2, 3, 4, 5, 6].filter((d) => !s.openWeekdays.includes(d));
  const closedText = closed.length ? ` ${closed.map((d) => WEEKDAY_BN[d]).join(", ")} বন্ধ।` : "";
  return (
    `${dayList(s.openWeekdays)}, ${time(s.open)} থেকে ${time(s.close)} পর্যন্ত খোলা।` +
    closedText +
    ` ${time(s.prayerBreak.start)} থেকে ${time(s.prayerBreak.end)} নামাজের বিরতি।`
  );
}

export function buildClinicInfo(c: ClinicContext, topic: ClinicInfoTopic): string {
  const s = c.settings;
  switch (topic) {
    case "hours":
      return hoursBn(c);
    case "address":
      return `${c.addressBn}। ${s.landmarkBn}।`;
    case "directions":
      return s.directionsBn;
    case "services":
      return `আমাদের সেবা: ${c.services.map((x) => x.nameBn).join(", ")}।`;
    case "fees":
      return c.services
        .map((x) => `${x.nameBn} ${money(x.feeBdtFrom)}${x.feeIsFrom ? " থেকে শুরু" : ""}`)
        .join("; ")
        .concat("।");
    case "doctors":
      return c.doctors
        .map((d) => {
          const days = [...new Set(d.schedule.map((x) => x.weekday))];
          const first = d.schedule[0];
          const hrs = first ? `, ${time(first.start)} থেকে ${time(first.end)}` : "";
          return `${d.nameBn}, ${SPECIALTY_BN[d.specialty] ?? d.specialty}, ${dayList(days)}${hrs}`;
        })
        .join("। ")
        .concat("।");
    case "preparation":
      return s.preparationBn;
    case "payment":
      return s.paymentBn;
    case "parking":
      return s.parkingBn;
  }
}

