/** Callbacks (T3.4, FR-D10): open/done, priority, reason, category; mark done with a note. */
import Link from "next/link";
import { canWrite, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, PriorityBadge } from "@/components/portal/StatusBadge";
import { Card, EmptyState, ErrorState, PageHeader, dbErrorDetail } from "@/components/portal/ui";
import { formatDateTime, titleCase } from "../../_lib/format";
import { DoneForm } from "./DoneForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Callbacks | ByteVoice Bangla portal" };

export default async function CallbacksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const status = (await searchParams).status === "done" ? "done" : "open";

  let rows: Awaited<ReturnType<typeof load>> = [];
  let counts = { open: 0, done: 0 };
  let loadError: unknown;
  try {
    const [list, open, done] = await Promise.all([
      load(staff.clinicId, status),
      db.callback.count({ where: { clinicId: staff.clinicId, status: "open" } }),
      db.callback.count({ where: { clinicId: staff.clinicId, status: "done" } }),
    ]);
    rows = list;
    counts = { open, done };
  } catch (err) {
    console.error("[portal] callbacks failed", err);
    loadError = err;
  }

  return (
    <>
      <PageHeader
        title="Callbacks"
        description="Requests Byte could not finish alone: medical questions, complaints, urgent cases and people who asked for a human."
      />
      <div
        role="tablist"
        aria-label="Callback status"
        className="mb-4 inline-flex rounded-md bg-surface-2 p-0.5 text-sm"
      >
        {(["open", "done"] as const).map((s) => (
          <Link
            key={s}
            role="tab"
            aria-selected={status === s}
            href={`/portal/callbacks${s === "done" ? "?status=done" : ""}`}
            className={`rounded px-3 py-1.5 font-medium ${status === s ? "bg-surface text-fg shadow-card" : "text-fg-muted hover:text-fg"}`}
          >
            {s === "open" ? "Open" : "Done"}{" "}
            <span className="font-latin text-fg-subtle tabular-nums">{counts[s]}</span>
          </Link>
        ))}
      </div>

      {loadError ? (
        <ErrorState title="Could not load callbacks" detail={dbErrorDetail(loadError)} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState title={status === "open" ? "No open callbacks" : "Nothing closed yet"}>
            {status === "open" ? "All caught up. New requests from calls appear here." : null}
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((cb) => (
            <li key={cb.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={cb.priority} />
                    <Badge tone={cb.category === "urgent" ? "failed" : "cancelled"}>
                      {titleCase(cb.category)}
                    </Badge>
                    <span className="font-latin text-xs text-fg-subtle">
                      {formatDateTime(cb.createdAt)}
                    </span>
                  </div>
                  <p className="font-medium">
                    {cb.name ?? cb.patient?.fullNameBn ?? "Unknown caller"}
                    {cb.phoneE164 ? (
                      <a
                        href={`tel:${cb.phoneE164}`}
                        className="ml-2 font-latin text-sm font-normal text-link tabular-nums hover:underline"
                      >
                        {cb.phoneE164}
                      </a>
                    ) : null}
                  </p>
                  <p className="text-sm leading-relaxed">{cb.reason}</p>
                  {cb.status === "done" ? (
                    <p className="text-xs text-fg-muted">
                      Done {formatDateTime(cb.doneAt)}
                      {cb.doneBy ? ` by ${cb.doneBy.name}` : ""}
                      {cb.note ? `: ${cb.note}` : ""}
                    </p>
                  ) : null}
                  {cb.callId ? (
                    <Link
                      href={`/portal/calls/${cb.callId}`}
                      className="inline-block text-xs text-link hover:underline"
                    >
                      View call
                    </Link>
                  ) : null}
                </div>
                {cb.status === "open" ? (
                  <DoneForm callbackId={cb.id} disabled={!canWrite(staff)} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function load(clinicId: string, status: "open" | "done") {
  return db.callback.findMany({
    where: { clinicId, status },
    orderBy:
      status === "open" ? [{ priority: "desc" }, { createdAt: "asc" }] : [{ doneAt: "desc" }],
    take: 200,
    include: {
      patient: { select: { fullNameBn: true } },
      doneBy: { select: { name: true } },
    },
  });
}
