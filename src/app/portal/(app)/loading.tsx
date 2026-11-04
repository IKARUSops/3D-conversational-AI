/** Shown while a portal page loads its data (server components stream in). */
export default function PortalLoading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-6 motion-reduce:animate-none">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-48 rounded-md bg-surface-2" />
      <div className="h-4 w-80 max-w-full rounded-md bg-surface-2" />
      <div className="space-y-3 rounded-lg border border-border bg-surface p-5 shadow-card">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-10 rounded-md bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
