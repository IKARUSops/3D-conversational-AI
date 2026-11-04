/**
 * Call detail (T3.3): FR-D5 header + extracted fields + validation badges + summaries,
 * FR-D6 transcript (live main view, "Re-transcribed audio" tab), FR-D7 recording,
 * FR-D8 event timeline, linked appointment and callbacks.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { AutoRefresh } from "@/components/portal/AutoRefresh";
import {
  AppointmentStatusBadge,
  Badge,
  CheckBadge,
  PriorityBadge,
  StatusBadge,
} from "@/components/portal/StatusBadge";
import {
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  dbErrorDetail,
} from "@/components/portal/ui";
import {
  PROVIDER_LABEL,
  formatDateTime,
  formatDuration,
  formatTime,
  mmss,
  titleCase,
} from "../../../_lib/format";
import { buildTranscriptItems, markerLabel, type TranscriptItem } from "../../../_lib/transcript";
import { RecordingPlayer } from "./RecordingPlayer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Call detail | ByteVoice Bangla portal" };

function loadCall(id: string, clinicId: string) {
  return db.call.findFirst({
    where: { id, clinicId },
    include: {
      patient: true,
      extraction: true,
      turns: { orderBy: [{ source: "asc" }, { seq: "asc" }] },
      events: { orderBy: { ts: "asc" }, take: 500 },
      appointmentsCreated: { include: { doctor: true, service: true } },
      appointmentsUpdated: { include: { doctor: true, service: true } },
      callbacks: { orderBy: { createdAt: "asc" } },
    },
  });
}
type CallFull = NonNullable<Awaited<ReturnType<typeof loadCall>>>;

export default async function CallDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const { id } = await params;
  const tab = (await searchParams).tab === "batch" ? "batch" : "live";
  if (!z.uuid().safeParse(id).success) notFound();

  let call: CallFull | null = null;
  let loadError: unknown;
  try {
    call = await loadCall(id, staff.clinicId);
  } catch (err) {
    console.error("[portal] call detail failed", err);
    loadError = err;
  }
  if (loadError) {
    return (
      <>
        <PageHeader title="Call" back={{ href: "/portal/calls", label: "All calls" }} />
        <ErrorState title="Could not load this call" detail={dbErrorDetail(loadError)} />
      </>
    );
  }
  if (!call) notFound();

  const ex = call.extraction;
  const nameBn = ex?.patientNameBn ?? call.patient?.fullNameBn ?? null;
  const nameEn = ex?.patientNameEn ?? call.patient?.fullNameEn ?? null;
  const phone = ex?.phoneE164 ?? call.patient?.phoneE164 ?? ex?.phoneRaw ?? null;
  const live = call.turns.filter((t) => t.source === "live");
  const batch = call.turns.filter((t) => t.source === "batch");
  const appointments = dedupeById([...call.appointmentsCreated, ...call.appointmentsUpdated]);
  const isProcessing = call.status === "processing";
  const items = buildTranscriptItems(
    tab === "live" ? live : batch,
    tab === "live" ? call.events : [],
    call.startedAt,
  );
  const validationErrors = readValidationErrors(ex?.validationErrors);

  return (
    <>
      <PageHeader
        back={{ href: "/portal/calls", label: "All calls" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span>{nameBn ?? nameEn ?? "Unknown caller"}</span>
            <StatusBadge status={call.status} />
          </span>
        }
        description={
          <span className="font-latin">
            {formatDateTime(call.startedAt)} · {formatDuration(call.durationS)} · STT{" "}
            {PROVIDER_LABEL[call.sttProvider]} · Voice {PROVIDER_LABEL[call.ttsProvider]} ·{" "}
            {call.keySource === "byok" ? "Clinic key (BYOK)" : "Platform key"}
          </span>
        }
        actions={isProcessing ? <AutoRefresh /> : undefined}
      />

      {isProcessing ? (
        <p className="mb-6 rounded-lg border border-border bg-status-processing-bg px-4 py-3 text-sm text-status-processing-fg">
          Byte is still summarising this call. Status and fields appear here within about two
          minutes (processing state: {call.processingState}).
        </p>
      ) : call.processingState === "failed" ? (
        <p className="mb-6 rounded-lg border border-border bg-status-failed-bg px-4 py-3 text-sm text-status-failed-fg">
          Post-call processing failed after retries. The live transcript below is kept as recorded.
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Card title="Summary">
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-fg-subtle">বাংলা</p>
                <p className="leading-relaxed">{call.summaryBn ?? "No summary yet."}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-fg-subtle">English</p>
                <p className="font-latin leading-relaxed">{call.summaryEn ?? "No summary yet."}</p>
              </div>
            </div>
          </Card>

          <Card
            title="Extracted details"
            aside={
              <div className="flex flex-wrap justify-end gap-1.5">
                <CheckBadge
                  ok={Boolean(ex?.phoneValid)}
                  label={ex?.phoneValid ? "Phone valid" : "Phone not valid"}
                />
                <CheckBadge
                  ok={Boolean(ex?.callerConfirmed)}
                  label={ex?.callerConfirmed ? "Confirmed by caller" : "Not confirmed"}
                />
                <CheckBadge
                  ok={Boolean(ex?.preferredDatetime)}
                  label={ex?.preferredDatetime ? "Date resolved" : "Date not resolved"}
                />
              </div>
            }
          >
            <dl className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Name (Bangla)">{nameBn ?? "-"}</Field>
              <Field label="Name (English letters)">
                <span className="font-latin">{nameEn ?? "-"}</span>
              </Field>
              <Field label="Phone">
                <span className="font-latin tabular-nums">{phone ?? "-"}</span>
                {ex?.phoneRaw && ex.phoneRaw !== phone ? (
                  <span className="block text-xs text-fg-subtle">said: {ex.phoneRaw}</span>
                ) : null}
              </Field>
              <Field label="Intent">{titleCase(ex?.intent ?? call.intent)}</Field>
              <Field label="Reason for visit">{ex?.reasonForVisit ?? "-"}</Field>
              <Field label="Service">{titleCase(ex?.serviceCode)}</Field>
              <Field label="Doctor requested">{ex?.doctorRequested ?? "-"}</Field>
              <Field label="Preferred time (as said)">{ex?.preferredDatetimeText ?? "-"}</Field>
              <Field label="Preferred time (resolved)">
                <span className="font-latin">{formatDateTime(ex?.preferredDatetime)}</span>
              </Field>
              <Field label="Sentiment">{titleCase(ex?.sentiment)}</Field>
              <Field label="Language">{titleCase(ex?.languageMix)}</Field>
              <Field label="End reason">{titleCase(call.endReason)}</Field>
            </dl>
            {validationErrors.length > 0 ? (
              <div className="border-t border-border px-5 py-3">
                <p className="text-xs font-medium text-fg-subtle">Validation notes</p>
                <ul className="mt-1 list-inside list-disc text-sm text-warning">
                  {validationErrors.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          <Card
            title="Transcript"
            aside={
              <div
                role="tablist"
                aria-label="Transcript source"
                className="flex rounded-md bg-surface-2 p-0.5 text-xs"
              >
                <TabLink
                  id={call.id}
                  tab="live"
                  active={tab === "live"}
                  label={`Live (${live.length})`}
                />
                <TabLink
                  id={call.id}
                  tab="batch"
                  active={tab === "batch"}
                  label={`Re-transcribed audio (${batch.length})`}
                />
              </div>
            }
          >
            {tab === "batch" ? (
              <p className="border-b border-border px-5 py-2 text-xs text-fg-subtle">
                Caller audio transcribed again after the call (batch STT). The live transcript stays
                the main record.
              </p>
            ) : null}
            {items.length === 0 ? (
              <EmptyState
                title={tab === "live" ? "No transcript saved" : "No re-transcription yet"}
              >
                {tab === "batch"
                  ? "It appears after post-call processing when a recording exists."
                  : null}
              </EmptyState>
            ) : (
              <ol className="space-y-3 p-5">
                {items.map((item) => (
                  <TranscriptRow key={item.kind === "turn" ? item.turn.id : item.id} item={item} />
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card title="Recording">
            <div className="p-5">
              {call.recordingPath ? (
                <RecordingPlayer callId={call.id} />
              ) : (
                <p className="text-sm text-fg-muted">No recording for this call.</p>
              )}
            </div>
          </Card>

          <Card title="Appointment">
            <div className="space-y-4 p-5">
              {appointments.length === 0 ? (
                <p className="text-sm text-fg-muted">
                  No appointment was created or changed in this call.
                </p>
              ) : (
                appointments.map((a) => (
                  <div key={a.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-latin text-sm font-medium">
                        {formatDateTime(a.slotStart)}
                      </p>
                      <AppointmentStatusBadge status={a.status} />
                    </div>
                    <p className="text-sm">{a.doctor.nameBn}</p>
                    <p className="text-xs text-fg-subtle">
                      {a.service?.nameEn ?? "Service not set"}
                    </p>
                    <Link href="/portal/appointments" className="text-xs text-link hover:underline">
                      All appointments
                    </Link>
                  </div>
                ))
              )}
            </div>
          </Card>

          {call.callbacks.length > 0 ? (
            <Card title="Callbacks">
              <ul className="divide-y divide-border">
                {call.callbacks.map((cb) => (
                  <li key={cb.id} className="space-y-1 px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={cb.priority} />
                      <Badge tone={cb.status === "open" ? "follow-up" : "booked"}>
                        {cb.status === "open" ? "Open" : "Done"}
                      </Badge>
                      <span className="text-xs text-fg-subtle">{titleCase(cb.category)}</span>
                    </div>
                    <p className="text-sm">{cb.reason}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card
            title="Event timeline"
            aside={<span className="text-xs text-fg-subtle">{call.events.length}</span>}
          >
            {call.events.length === 0 ? (
              <p className="p-5 text-sm text-fg-muted">No events logged.</p>
            ) : (
              <ol className="max-h-[28rem] space-y-2 overflow-y-auto p-5 text-xs">
                {call.events.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="font-latin shrink-0 text-fg-subtle tabular-nums">
                      {mmss(e.ts.getTime() - call.startedAt.getTime())}
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium">{markerLabel(e.type, e.payload).label}</span>
                      <EventDetail type={e.type} payload={e.payload} />
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Technical">
            <dl className="grid grid-cols-2 gap-4 p-5">
              <Field label="Started">
                <span className="font-latin">{formatTime(call.startedAt)}</span>
              </Field>
              <Field label="Ended">
                <span className="font-latin">{formatTime(call.endedAt)}</span>
              </Field>
              <Field label="LLM">
                <span className="font-latin text-xs">{call.llmModel ?? "-"}</span>
              </Field>
              <Field label="Processing">{titleCase(call.processingState)}</Field>
              <Field label="Call id">
                <span className="font-latin text-xs break-all text-fg-subtle">{call.id}</span>
              </Field>
            </dl>
          </Card>
        </aside>
      </div>
    </>
  );
}

function dedupeById<T extends { id: string }>(list: T[]): T[] {
  return [...new Map(list.map((a) => [a.id, a])).values()];
}

function readValidationErrors(value: unknown): string[] {
  if (!value) return [];
  const list = Array.isArray(value)
    ? value
    : typeof value === "object"
      ? Object.entries(value as object)
      : [value];
  return list
    .map((v) => {
      if (typeof v === "string") return v;
      if (Array.isArray(v))
        return `${v[0]}: ${typeof v[1] === "string" ? v[1] : JSON.stringify(v[1])}`;
      if (v && typeof v === "object" && "message" in v)
        return String((v as { message: unknown }).message);
      return JSON.stringify(v);
    })
    .slice(0, 20);
}

function TabLink({
  id,
  tab,
  active,
  label,
}: {
  id: string;
  tab: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      role="tab"
      aria-selected={active}
      href={`/portal/calls/${id}${tab === "batch" ? "?tab=batch" : ""}`}
      scroll={false}
      className={`rounded px-2.5 py-1 font-medium ${active ? "bg-surface text-fg shadow-card" : "text-fg-muted hover:text-fg"}`}
    >
      {label}
    </Link>
  );
}

function TranscriptRow({ item }: { item: TranscriptItem }) {
  if (item.kind === "marker") {
    return (
      <li className="flex items-center gap-3 pl-14 text-xs text-fg-subtle">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span
          className={`rounded-full border border-border px-2 py-0.5 ${item.ok === false ? "text-warning" : ""}`}
        >
          {mmss(item.atMs)} · {item.label}
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </li>
    );
  }
  const t = item.turn;
  const isAgent = t.speaker === "agent";
  const isSystem = t.speaker === "system";
  return (
    <li className="flex gap-3">
      <span className="font-latin w-11 shrink-0 pt-2 text-right text-xs text-fg-subtle tabular-nums">
        {mmss(t.startedMs)}
      </span>
      <div
        className={`min-w-0 flex-1 rounded-md border px-3 py-2 ${
          isAgent
            ? "border-primary/30 bg-primary/10"
            : isSystem
              ? "border-dashed border-border"
              : "border-border bg-surface-2"
        }`}
      >
        <p className="mb-0.5 flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className={isAgent ? "text-accent-fg" : "text-fg-muted"}>
            {isAgent ? "Agent (Byte)" : isSystem ? "System" : "Caller"}
          </span>
          {t.interrupted ? <Badge tone="incomplete">Interrupted</Badge> : null}
          {t.inputMode === "typed" ? <Badge tone="processing">Typed</Badge> : null}
        </p>
        <p className="leading-relaxed">{t.textBn}</p>
        {t.textEn ? <p className="mt-1 font-latin text-sm text-fg-muted">{t.textEn}</p> : null}
      </div>
    </li>
  );
}

function EventDetail({ type, payload }: { type: string; payload: unknown }) {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  let text: string | null = null;
  if (type === "turn_latency") {
    const parts = [
      typeof p.firstTokenMs === "number" ? `first token ${Math.round(p.firstTokenMs)} ms` : null,
      typeof p.firstAudioMs === "number" ? `first audio ${Math.round(p.firstAudioMs)} ms` : null,
    ].filter(Boolean);
    text = parts.join(", ") || null;
  } else if (type === "tool_result" && typeof p.ms === "number") {
    text = `${Math.round(p.ms)} ms`;
  } else if (typeof p.reason === "string") {
    text = p.reason;
  } else if (typeof p.message === "string") {
    text = p.message;
  }
  return text ? <span className="block text-fg-subtle">{text}</span> : null;
}
