/** Appointments (T3.4, FR-D9): upcoming and past, by doctor and date, status, link to the call. */
import Link from "next/link";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppointmentStatusBadge } from "@/components/portal/StatusBadge";
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  buttonPrimary,
  buttonSecondary,
  dbErrorDetail,
  fieldClass,
} from "@/components/portal/ui";
import {
  dhakaDateKey,
  dhakaDayStart,
  dhakaNextDayStart,
  formatTime,
  readSearchParams,
} from "../../_lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Appointments | ByteVoice Bangla portal" };

const QuerySchema = z.object({
  view: z.enum(["upcoming", "past"]).catch("upcoming"),
  doctor: z.uuid().optional().catch(undefined),
  date: z.iso.date().optional().catch(undefined),
});

const dayHeading = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const raw = readSearchParams(await searchParams);
  const q = QuerySchema.parse(raw);
  const now = new Date();

  const where: Record<string, unknown> = { clinicId: staff.clinicId };
  if (q.doctor) where.doctorId = q.doctor;
  if (q.date) {
    where.slotStart = { gte: dhakaDayStart(q.date), lt: dhakaNextDayStart(q.date) };
  } else {
    where.slotStart = q.view === "upcoming" ? { gte: now } : { lt: now };
  }

  let rows: Awaited<ReturnType<typeof load>> = [];
  let doctors: { id: string; nameBn: string; nameEn: string }[] = [];
  let loadError: unknown;
  try {
    [rows, doctors] = await Promise.all([
      load(where, q.view === "upcoming" || Boolean(q.date)),
      db.doctor.findMany({
        where: { clinicId: staff.clinicId },
        select: { id: true, nameBn: true, nameEn: true },
        orderBy: { nameEn: "asc" },
      }),
    ]);
  } catch (err) {
    console.error("[portal] appointments failed", err);
    loadError = err;
  }

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = dhakaDateKey(r.slotStart);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Bookings made or changed by Byte and staff. Dhaka time."
      />

      <form
        method="get"
        className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3"
      >
        <div
          role="group"
          aria-label="Upcoming or past"
          className="flex rounded-md bg-surface-2 p-0.5 text-sm"
        >
          {(["upcoming", "past"] as const).map((v) => (
            <Link
              key={v}
              href={`/portal/appointments?view=${v}${q.doctor ? `&doctor=${q.doctor}` : ""}`}
              aria-current={q.view === v && !q.date ? "page" : undefined}
              className={`rounded px-3 py-1.5 font-medium ${
                q.view === v && !q.date
                  ? "bg-surface text-fg shadow-card"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {v === "upcoming" ? "Upcoming" : "Past"}
            </Link>
          ))}
        </div>
        <input type="hidden" name="view" value={q.view} />
        <select
          name="doctor"
          defaultValue={q.doctor ?? ""}
          className={fieldClass}
          aria-label="Doctor"
        >
          <option value="">All doctors</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nameEn}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="date"
          defaultValue={q.date ?? ""}
          className={fieldClass}
          aria-label="Date"
        />
        <button type="submit" className={buttonPrimary}>
          Apply
        </button>
        {q.doctor || q.date ? (
          <Link href={`/portal/appointments?view=${q.view}`} className={buttonSecondary}>
            Clear
          </Link>
        ) : null}
      </form>

      {loadError ? (
        <ErrorState title="Could not load appointments" detail={dbErrorDetail(loadError)} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title={q.view === "upcoming" ? "No upcoming appointments" : "No past appointments"}
          >
            Bookings appear here as soon as Byte confirms them on a call.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-2 text-sm font-semibold text-fg-muted">
                {dayHeading.format(dhakaDayStart(day))}
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-card">
                {list.map((a) => {
                  const callId = a.updatedByCallId ?? a.createdByCallId;
                  return (
                    <li
                      key={a.id}
                      className="grid gap-2 px-4 py-3 sm:grid-cols-[6rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                    >
                      <span className="font-latin text-sm font-semibold tabular-nums">
                        {formatTime(a.slotStart)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {a.patient.fullNameBn ?? a.patient.fullNameEn ?? "Unknown"}
                        </span>
                        <span className="block font-latin text-xs text-fg-subtle tabular-nums">
                          {a.patient.phoneE164}
                        </span>
                      </span>
                      <span className="min-w-0 text-sm">
                        <span className="block truncate">{a.doctor.nameBn}</span>
                        <span className="block truncate text-xs text-fg-subtle">
                          {a.doctor.nameEn}
                        </span>
                      </span>
                      <span className="min-w-0 text-sm">
                        <span className="block truncate">
                          {a.service?.nameEn ?? "Service not set"}
                        </span>
                        {a.reason ? (
                          <span className="block truncate text-xs text-fg-subtle">{a.reason}</span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-3 sm:justify-end">
                        <AppointmentStatusBadge status={a.status} />
                        {callId ? (
                          <Link
                            href={`/portal/calls/${callId}`}
                            className="text-xs whitespace-nowrap text-link hover:underline"
                          >
                            View call
                          </Link>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function load(where: Record<string, unknown>, ascending: boolean) {
  return db.appointment.findMany({
    where,
    orderBy: { slotStart: ascending ? "asc" : "desc" },
    take: 200,
    include: {
      patient: { select: { fullNameBn: true, fullNameEn: true, phoneE164: true } },
      doctor: { select: { nameBn: true, nameEn: true } },
      service: { select: { nameEn: true } },
    },
  });
}
