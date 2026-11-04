"use client";
/** Any unexpected error on a portal page: say what happened and offer a retry. */
import { useEffect } from "react";
import { ErrorState, buttonSecondary } from "@/components/portal/ui";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[portal] page error", error.digest ?? error.message);
  }, [error]);
  return (
    <div className="space-y-4">
      <ErrorState
        title="This page could not load"
        detail="The database or a service did not answer in time. Your data is safe. Try again in a moment."
      />
      <button type="button" onClick={reset} className={buttonSecondary}>
        Try again
      </button>
    </div>
  );
}
