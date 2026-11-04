/**
 * Status badges (FR-D14, FR-D15): colour + dot + text, never colour alone.
 * Class names are written out in full so Tailwind can find them.
 */
import type { CallStatus } from "@/contracts";

type Tone =
  | "processing"
  | "booked"
  | "rescheduled"
  | "cancelled"
  | "enquiry"
  | "follow-up"
  | "incomplete"
  | "failed"
  | "spam";

const TONE_CLASS: Record<Tone, string> = {
  processing: "bg-status-processing-bg text-status-processing-fg",
  booked: "bg-status-booked-bg text-status-booked-fg",
  rescheduled: "bg-status-rescheduled-bg text-status-rescheduled-fg",
  cancelled: "bg-status-cancelled-bg text-status-cancelled-fg",
  enquiry: "bg-status-enquiry-bg text-status-enquiry-fg",
  "follow-up": "bg-status-follow-up-bg text-status-follow-up-fg",
  incomplete: "bg-status-incomplete-bg text-status-incomplete-fg",
  failed: "bg-status-failed-bg text-status-failed-fg",
  spam: "bg-status-spam-bg text-status-spam-fg",
};

export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  processing: "Processing",
  booked: "Booked",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
  enquiry: "Enquiry",
  follow_up_needed: "Follow-up needed",
  incomplete: "Incomplete",
  failed: "Failed",
  spam: "Spam",
};

const CALL_TONE: Record<CallStatus, Tone> = {
  processing: "processing",
  booked: "booked",
  rescheduled: "rescheduled",
  cancelled: "cancelled",
  enquiry: "enquiry",
  follow_up_needed: "follow-up",
  incomplete: "incomplete",
  failed: "failed",
  spam: "spam",
};

export function Badge({
  tone,
  children,
  pulse,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASS[tone]} ${className ?? ""}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full bg-current ${pulse ? "bv-pulse-dot" : ""}`}
      />
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: CallStatus }) {
  return (
    <Badge tone={CALL_TONE[status]} pulse={status === "processing"}>
      {CALL_STATUS_LABEL[status]}
    </Badge>
  );
}

const APPOINTMENT_TONE: Record<string, Tone> = {
  booked: "booked",
  rescheduled: "rescheduled",
  cancelled: "cancelled",
  completed: "enquiry",
  no_show: "incomplete",
};
export function AppointmentStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={APPOINTMENT_TONE[status] ?? "processing"}>
      {status === "no_show" ? "No show" : status[0]!.toUpperCase() + status.slice(1)}
    </Badge>
  );
}

const PRIORITY_TONE: Record<string, Tone> = {
  low: "cancelled",
  normal: "rescheduled",
  high: "incomplete",
  urgent: "failed",
};
export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge tone={PRIORITY_TONE[priority] ?? "processing"}>
      {priority[0]!.toUpperCase() + priority.slice(1)}
    </Badge>
  );
}

/** Validation badge for extracted fields (FR-D5). */
export function CheckBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge tone={ok ? "booked" : "incomplete"}>
      {ok ? "✓" : "!"} {label}
    </Badge>
  );
}
