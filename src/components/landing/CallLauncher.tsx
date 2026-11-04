"use client";
/**
 * FR-A3 / FR-B1: the hero button opens the call panel without leaving the page.
 * The panel is loaded on demand from ./call-adapter (Agent B's CallPanel after merge).
 */
import dynamic from "next/dynamic";
import { useLang } from "@/lib/i18n/LangProvider";
import { IconPhone } from "@/components/ui/icons";
import { useMascotBridge } from "./MascotBridge";

const CallPanel = dynamic(() => import("./call-adapter"), { ssr: false });

export function CallLauncher({ className }: { className?: string }) {
  const { t, lang } = useLang();
  const { panelOpen, openPanel, closePanel, setSignal } = useMascotBridge();
  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        className={`group inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-primary px-6 py-3 text-base font-semibold text-on-primary transition-[background-color,box-shadow] duration-150 hover:bg-primary-hover hover:shadow-glow ${className ?? ""}`}
      >
        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-navy-900 text-gold-500">
          <IconPhone size={16} />
        </span>
        {t.hero.cta}
      </button>
      {panelOpen ? (
        <CallPanel open={panelOpen} onClose={closePanel} lang={lang} onMascotChange={setSignal} />
      ) : null}
    </>
  );
}
