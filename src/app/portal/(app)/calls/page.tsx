/**
 * Calls list (T3.2): FR-D2 columns, FR-D3 search/filters/pagination, FR-D4 live refresh,
 * FR-D12 dashboard strip, FR-D14 status badges.
 */
import Link from "next/link";
import { CallStatus, CallsListQuerySchema, SttProviderId, TtsProviderId } from "@/contracts";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { AutoRefresh } from "@/components/portal/AutoRefresh";
import { CALL_STATUS_LABEL, StatusBadge } from "@/components/portal/StatusBadge";
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
import { IconSearch } from "@/components/ui/icons";
import {
  PAGE_SIZE,
  PROVIDER_LABEL,
  buildCallsWhere,
  dhakaDateKey,
  dhakaDayStart,
  formatDate,
  formatDuration,
  formatTime,
  maskPhone,
  readSearchParams,
  titleCase,
  withParams,
} from "../../_lib/format";
import { sweepStaleCalls } from "../../_lib/stale-sweep";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calls | ByteVoice Bangla portal" };

type SP = Promise<Record<string, string | string[] | undefined>>;

async function loadStats(clinicId: string) {
  const start = dhakaDayStart(dhakaDateKey(new Date()));
  const today = { clinicId, startedAt: { gte: start } };
  const [callsToday, bookedToday, finalToday, callbacksOpen, avg] = await Promise.all([
    db.call.count({ where: today }),
    db.call.count({ where: { ...today, status: "booked" } }),
    db.call.count({ where: { ...today, status: { not: "processing" } } }),
    db.callback.count({ where: { clinicId, status: "open" } }),
    db.call.aggregate({ where: { ...today, durationS: { not: null } }, _avg: { durationS: true } }),
  ]);
  return {
    callsToday,
    bookedToday,
    callbacksOpen,
    avgDuration: avg._avg.durationS,
    bookingRate: finalToday > 0 ? Math.round((bookedToday / finalToday) * 100) : null,
  };
}

export default async function CallsPage({ searchParams }: { searchParams: SP }) {
  const staff = await requireStaff();
  const raw = readSearchParams(await searchParams);
  const parsed = CallsListQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : { page: 1 };
  const page = query.page;

  try {
    await sweepStaleCalls();
  } catch (err) {
    console.error("[portal] stale sweep failed", err);
  }

  let data:
    | {
        total: number;
        rows: Awaited<ReturnType<typeof loadRows>>;
        stats: Awaited<ReturnType<typeof loadStats>>;
      }
    | undefined;
  let loadError: unknown;
  try {
    const where = buildCallsWhere(staff.clinicId, query);
    const [total, rows, stats] = await Promise.all([
      db.call.count({ where }),
      loadRows(where, page),
      loadStats(staff.clinicId),
    ]);
    data = { total, rows, stats };
  } catch (err) {
    console.error("[portal] calls list failed", err);
    loadError = err;
  }

  const filtersActive = Boolean(
    query.q || query.status || query.from || query.to || query.stt || query.tts,
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader
        title="Calls"
        description="Every call to Byte, newest first. Times are Dhaka time."
        actions={<AutoRefresh />}
      />

      {data ? <StatsStrip stats={data.stats} /> : null}

      <form
        method="get"
        className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface p-3 sm:grid-cols-3 lg:grid-cols-[minmax(12rem,2fr)_repeat(5,minmax(0,1fr))_auto]"
        role="search"
        aria-label="Search and filter calls"
      >
        <label className="relative col-span-2 sm:col-span-3 lg:col-span-1">
          <span className="sr-only">Search by name or phone</span>
          <IconSearch
            size={16}
            className="pointer-events-none absolute top-3 left-3 text-fg-subtle"
          />
          <input
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Name or phone"
            className={`${fieldClass} w-full pl-9`}
          />
        </label>
        <Select name="status" label="Status" value={query.status}>
          {CallStatus.map((s) => (
            <option key={s} value={s}>
              {CALL_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <label className="flex flex-col">
          <span className="sr-only">From date</span>
          <input
            type="date"
            name="from"
            defaultValue={query.from ?? ""}
            className={fieldClass}
            aria-label="From date"
          />
        </label>
        <label className="flex flex-col">
          <span className="sr-only">To date</span>
          <input
            type="date"
            name="to"
            defaultValue={query.to ?? ""}
            className={fieldClass}
            aria-label="To date"
          />
        </label>
        <Select name="stt" label="STT" value={query.stt}>
          {SttProviderId.map((p) => (
            <option key={p} value={p}>
              STT: {PROVIDER_LABEL[p]}
            </option>
          ))}
        </Select>
        <Select name="tts" label="Voice" value={query.tts}>
          {TtsProviderId.map((p) => (
            <option key={p} value={p}>
              Voice: {PROVIDER_LABEL[p]}
            </option>
          ))}
        </Select>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <button type="submit" className={`${buttonPrimary} flex-1`}>
            Apply
          </button>
          {filtersActive ? (
            <Link href="/portal/calls" className={buttonSecondary}>
              Clear
            </Link>
          ) : null}
        </div>
      </form>
      {!parsed.success ? (
        <p className="mb-4 text-sm text-warning">Some filters were not valid and were ignored.</p>
      ) : null}

      {loadError ? (
        <ErrorState title="Could not load calls" detail={dbErrorDetail(loadError)} />
      ) : data && data.rows.length === 0 ? (
        <Card>
          <EmptyState title={filtersActive ? "No calls match these filters" : "No calls yet"}>
            {filtersActive
              ? "Try a wider date range or clear the filters."
              : "Calls appear here a few seconds after someone talks to Byte on the website."}
          </EmptyState>
        </Card>
      ) : data ? (
        <>
          <CallsTable rows={data.rows} />
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
            <p className="text-fg-muted">
              {data.total} call{data.total === 1 ? "" : "s"} · page {page} of {pages}
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  className={buttonSecondary}
                  href={`/portal/calls${withParams(raw, { page: page - 1 })}`}
                >
                  Previous
                </Link>
              ) : null}
              {page < pages ? (
                <Link
                  className={buttonSecondary}
                  href={`/portal/calls${withParams(raw, { page: page + 1 })}`}
                >
                  Next
                </Link>
              ) : null}
            </div>
          </nav>
        </>
      ) : null}
    </>
  );
}

function loadRows(where: Record<string, unknown>, page: number) {
  return db.call.findMany({
    where,
    orderBy: { startedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      startedAt: true,
      durationS: true,
      status: true,
      intent: true,
      sttProvider: true,
      ttsProvider: true,
      keySource: true,
      patient: { select: { fullNameBn: true, fullNameEn: true, phoneE164: true } },
      extraction: {
        select: { patientNameBn: true, patientNameEn: true, phoneE164: true, phoneRaw: true },
      },
    },
  });
}

type Row = Awaited<ReturnType<typeof loadRows>>[number];

function callerOf(r: Row) {
  return {
    bn: r.patient?.fullNameBn ?? r.extraction?.patientNameBn ?? null,
    en: r.patient?.fullNameEn ?? r.extraction?.patientNameEn ?? null,
    phone: r.patient?.phoneE164 ?? r.extraction?.phoneE164 ?? r.extraction?.phoneRaw ?? null,
  };
}

function CallsTable({ rows }: { rows: Row[] }) {
  return (
    <>
      {/* Cards on small screens (FR-D16) */}
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => {
          const c = callerOf(r);
          return (
            <li key={r.id}>
              <Link
                href={`/portal/calls/${r.id}`}
                className="block rounded-lg border border-border bg-surface p-4 shadow-card hover:border-border-strong"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.bn ?? c.en ?? "Unknown caller"}</p>
                    <p className="font-latin text-xs text-fg-subtle tabular-nums">
                      {maskPhone(c.phone)}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-2 font-latin text-xs text-fg-muted tabular-nums">
                  {formatDate(r.startedAt)} · {formatTime(r.startedAt)} ·{" "}
                  {formatDuration(r.durationS)} · {titleCase(r.intent)}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface shadow-card md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs text-fg-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Date
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Caller
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Phone
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Length
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Intent
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                STT / Voice
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Keys
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const c = callerOf(r);
              return (
                <tr key={r.id} className="group relative hover:bg-surface-2">
                  <td className="px-4 py-3 font-latin whitespace-nowrap tabular-nums">
                    <Link
                      href={`/portal/calls/${r.id}`}
                      className="after:absolute after:inset-0 focus-visible:outline-none"
                    >
                      {formatDate(r.startedAt)}
                    </Link>
                    <span className="block text-xs text-fg-subtle">{formatTime(r.startedAt)}</span>
                  </td>
                  <td className="max-w-[14rem] px-4 py-3">
                    <span className="block truncate font-medium">
                      {c.bn ?? c.en ?? "Unknown caller"}
                    </span>
                    {c.bn && c.en ? (
                      <span className="block truncate font-latin text-xs text-fg-subtle">
                        {c.en}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-latin whitespace-nowrap tabular-nums">
                    {maskPhone(c.phone)}
                  </td>
                  <td className="px-4 py-3 font-latin tabular-nums">
                    {formatDuration(r.durationS)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3">{titleCase(r.intent)}</td>
                  <td className="px-4 py-3 font-latin whitespace-nowrap text-xs">
                    {PROVIDER_LABEL[r.sttProvider]} / {PROVIDER_LABEL[r.ttsProvider]}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.keySource === "byok" ? "BYOK" : "Platform"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Select({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col">
      <span className="sr-only">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={fieldClass} aria-label={label}>
        <option value="">{`All ${label === "Status" ? "statuses" : label}`}</option>
        {children}
      </select>
    </label>
  );
}

function StatsStrip({ stats }: { stats: Awaited<ReturnType<typeof loadStats>> }) {
  const items = [
    { label: "Calls today", value: String(stats.callsToday) },
    { label: "Booked today", value: String(stats.bookedToday) },
    { label: "Open callbacks", value: String(stats.callbacksOpen), href: "/portal/callbacks" },
    { label: "Avg. call length", value: formatDuration(stats.avgDuration) },
    { label: "Booking rate", value: stats.bookingRate == null ? "-" : `${stats.bookingRate}%` },
  ];
  return (
    <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
      {items.map((i) => (
        <div key={i.label} className="bg-surface px-4 py-3">
          <dt className="text-xs text-fg-subtle">{i.label}</dt>
          <dd className="mt-1 font-latin text-2xl font-semibold tabular-nums">
            {i.href ? (
              <Link href={i.href} className="hover:text-accent-fg">
                {i.value}
              </Link>
            ) : (
              i.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
