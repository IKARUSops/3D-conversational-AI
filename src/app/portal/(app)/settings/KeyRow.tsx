"use client";
import { useActionState } from "react";
import {
  deleteProviderKey,
  saveProviderKey,
  testProviderKey,
  type KeyActionState,
} from "./actions";

const small =
  "inline-flex h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

export function KeyRow({
  provider,
  label,
  stored,
  readOnly,
}: {
  provider: "elevenlabs" | "openai" | "azure";
  label: string;
  stored: { last4: string; validatedAt: string | null; region?: string } | null;
  readOnly: boolean;
}) {
  const [saveState, save, saving] = useActionState<KeyActionState, FormData>(saveProviderKey, {});
  const [testState, test, testing] = useActionState<KeyActionState, FormData>(testProviderKey, {});
  const [delState, del, deleting] = useActionState<KeyActionState, FormData>(deleteProviderKey, {});
  const message = [saveState, testState, delState].find((s) => s.message);

  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{label}</p>
          <p className="font-latin text-xs text-fg-subtle">
            {stored
              ? `Clinic key ••••${stored.last4}${stored.region ? ` · ${stored.region}` : ""} · ${
                  stored.validatedAt ? `tested ${stored.validatedAt}` : "not tested"
                }`
              : "Using the platform key"}
          </p>
        </div>
        {stored ? (
          <div className="flex gap-2">
            <form action={test}>
              <input type="hidden" name="provider" value={provider} />
              <button className={small} disabled={testing}>
                {testing ? "Testing…" : "Test key"}
              </button>
            </form>
            <form action={del}>
              <input type="hidden" name="provider" value={provider} />
              <button className={`${small} text-danger`} disabled={readOnly || deleting}>
                Delete
              </button>
            </form>
          </div>
        ) : null}
      </div>
      {!readOnly ? (
        <form action={save} className="flex flex-wrap gap-2">
          <input type="hidden" name="provider" value={provider} />
          <label className="sr-only" htmlFor={`key-${provider}`}>
            {label} API key
          </label>
          <input
            id={`key-${provider}`}
            name="key"
            type="password"
            autoComplete="off"
            placeholder={stored ? "Paste a new key to replace" : "Paste API key"}
            className="h-9 min-w-0 flex-1 rounded-sm border border-border-strong bg-surface px-3 text-sm"
          />
          {provider === "azure" ? (
            <input
              name="region"
              placeholder="Region (southeastasia)"
              defaultValue={stored?.region ?? ""}
              className="h-9 w-48 rounded-sm border border-border-strong bg-surface px-3 text-sm"
              aria-label="Azure region"
            />
          ) : null}
          <button className={small} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      ) : null}
      {message?.message ? (
        <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
          {message.message}
        </p>
      ) : null}
    </li>
  );
}
