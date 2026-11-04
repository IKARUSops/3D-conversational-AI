"use client";
/** FR-D4: refresh server data every few seconds with router.refresh(). Pauses in hidden tabs. */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [last, setLast] = useState<string>("");

  useEffect(() => {
    if (paused) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setLast(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka" }));
    };
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs, paused]);

  return (
    <button
      type="button"
      onClick={() => setPaused((p) => !p)}
      className="inline-flex h-8 items-center gap-2 rounded-full border border-border px-3 text-xs text-fg-muted hover:text-fg"
      aria-live="polite"
      title={paused ? "Resume live updates" : "Pause live updates"}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${paused ? "bg-fg-subtle" : "bv-pulse-dot bg-success"}`}
      />
      {paused ? "Paused" : "Live"}
      {last && !paused ? <span className="font-latin tabular-nums">· {last}</span> : null}
    </button>
  );
}
