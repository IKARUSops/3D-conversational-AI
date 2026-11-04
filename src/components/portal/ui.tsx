/** Small shared portal building blocks (DESIGN.md section 6). Server-safe. */
import Link from "next/link";
import { IconAlert } from "@/components/ui/icons";

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-2 inline-flex min-h-11 items-center rounded-md text-sm text-fg-muted hover:text-fg">
            ← {back.label}
          </Link>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({
  children,
  className,
  title,
  aside,
}: {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-lg border border-border bg-surface shadow-card ${className ?? ""}`}
    >
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-fg-muted">{children}</div> : null}
    </div>
  );
}

export function ErrorState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-border bg-status-failed-bg p-4 text-status-failed-fg"
    >
      <IconAlert className="mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        {detail ? <p className="mt-1 text-sm opacity-90">{detail}</p> : null}
      </div>
    </div>
  );
}

export const fieldClass =
  "h-10 rounded-sm border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle";

export const buttonPrimary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50";

export const buttonSecondary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border-strong px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

/** Definition list row used on detail pages. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

/** Friendly message for DB errors (no stack traces in the UI). */
export function dbErrorDetail(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("DATABASE_URL")) return "DATABASE_URL is not set on this server.";
  return "The database did not answer. Please refresh in a moment.";
}
