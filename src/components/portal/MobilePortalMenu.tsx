"use client";
/**
 * Portal header and menu for small screens (below lg).
 * - Button with aria-expanded / aria-controls; Escape closes and returns focus to the button.
 * - Closes after navigation and when the screen grows to the desktop layout.
 * - Opening moves focus to the first link, so keyboard users land inside the menu.
 */
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { IconMenu, IconX } from "@/components/ui/icons";

export function MobilePortalMenu({
  brand,
  children,
}: Readonly<{ brand: React.ReactNode; children: React.ReactNode }>) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [lastPath, setLastPath] = useState(pathname);

  // Close after a client navigation (the layout stays mounted).
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const mq = window.matchMedia("(min-width: 1024px)");
    const onWide = () => mq.matches && setOpen(false);
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface-2/95 backdrop-blur lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        {brand}
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-fg-muted hover:bg-surface hover:text-fg"
        >
          {open ? <IconX /> : <IconMenu />}
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </div>
      <div id={panelId} ref={panelRef} hidden={!open} className="space-y-4 px-4 pb-4">
        {children}
      </div>
    </header>
  );
}
