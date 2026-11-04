"use client";
import { useActionState, useState } from "react";
import { markCallbackDone, type CallbackActionState } from "./actions";

export function DoneForm({ callbackId, disabled }: { callbackId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CallbackActionState, FormData>(
    markCallbackDone,
    {},
  );

  if (disabled) {
    return <p className="text-xs text-fg-subtle">Read only: marking done is turned off.</p>;
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium hover:bg-surface-2"
      >
        Mark done
      </button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-col gap-2 sm:w-80">
      <input type="hidden" name="callbackId" value={callbackId} />
      <label htmlFor={`note-${callbackId}`} className="text-xs font-medium text-fg-muted">
        Note (what happened on the call back)
      </label>
      <textarea
        id={`note-${callbackId}`}
        name="note"
        rows={2}
        maxLength={1000}
        className="rounded-sm border border-border-strong bg-surface px-3 py-2 text-sm"
        placeholder="For example: called back, booked for Sunday 5 PM"
      />
      {state.error ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save and close"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 px-3 text-sm text-fg-muted hover:text-fg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
