"use client";
import { useState, useTransition } from "react";
import { IconPlay } from "@/components/ui/icons";
import { getRecordingUrl } from "./actions";

/** Loads the signed URL only when asked, so links are not created on every refresh. */
export function RecordingPlayer({ callId }: { callId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (url) {
    return (
      <div className="space-y-2">
        <audio controls autoPlay src={url} className="w-full" preload="auto">
          Your browser cannot play this audio.
        </audio>
        <p className="text-xs text-fg-subtle">Caller microphone. Link valid for 10 minutes.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await getRecordingUrl(callId);
            if (res.ok) setUrl(res.url);
            else setMessage(res.message);
          })
        }
        className="inline-flex h-10 items-center gap-2 rounded-md border border-border-strong px-4 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
      >
        <IconPlay size={16} />
        {pending ? "Loading…" : "Play recording"}
      </button>
      {message ? (
        <p role="status" className="text-sm text-fg-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}
