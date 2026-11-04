"use client";
/**
 * Hero call dialog (I-01; FR-A3, FR-A4, FR-B1, FR-B12, FR-B13). Wraps Agent B's CallPanel:
 * - one `useCall` controller shared by the panel and the 3D mascot (through MascotBridge);
 * - level getters are sent once, `mascotState` on every change. The mascot side smooths it
 *   (StateGate in src/components/three/shared.ts: each state >= 400 ms, Thinking only after
 *   a 300 ms wait), so the call client stays honest and the hero stays calm;
 * - `?key=` is the reviewer key (FR-B12); `?stt=` is read by CallPanel (FR-B13);
 * - closing the dialog (button or Escape) unmounts useCall, which ends a live call (FR-B8).
 */
import { useEffect, useRef, useState } from "react";
import { CallPanel, useCall } from "@/components/call";
import { IconX } from "@/components/ui/icons";
import { useLang } from "@/lib/i18n/LangProvider";
import type { CallPanelProps } from "./call-adapter";

function readReviewKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const key = new URLSearchParams(window.location.search).get("key")?.trim();
  return key ? key.slice(0, 200) : undefined;
}

export function HeroCallPanel({ open, onClose, lang, onMascotChange }: CallPanelProps) {
  const { t } = useLang();
  const [reviewKey] = useState(readReviewKey);
  const call = useCall({ lang, reviewKey });
  const closeRef = useRef<HTMLButtonElement>(null);
  const { getAgentLevel, getCallerLevel, mascotState } = call;

  useEffect(() => {
    onMascotChange({ getAgentLevel, getCallerLevel });
  }, [onMascotChange, getAgentLevel, getCallerLevel]);

  useEffect(() => {
    onMascotChange({ state: mascotState });
  }, [onMascotChange, mascotState]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t.call.previewTitle}
      className="call-dialog fixed inset-x-4 bottom-4 z-50 mx-auto max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto sm:right-6 sm:left-auto sm:mx-0 sm:w-[28rem]"
    >
      <div className="relative">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t.call.close}
          className="absolute top-3 right-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-glass hover:text-fg"
        >
          <IconX />
        </button>
        <CallPanel lang={lang} call={call} reviewKey={reviewKey} />
      </div>
    </div>
  );
}
