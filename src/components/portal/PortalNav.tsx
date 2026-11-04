"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconCalendar,
  IconCallback,
  IconDatabase,
  IconPhone,
  IconSettings,
} from "@/components/ui/icons";

const ITEMS = [
  { href: "/portal/calls", label: "Calls", Icon: IconPhone },
  { href: "/portal/appointments", label: "Appointments", Icon: IconCalendar },
  { href: "/portal/callbacks", label: "Callbacks", Icon: IconCallback },
  { href: "/portal/data-model", label: "Data model", Icon: IconDatabase },
  { href: "/portal/settings", label: "Settings", Icon: IconSettings },
] as const;

export function PortalNav({ showSettings }: { showSettings: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Portal" className="flex flex-col gap-1">
      {ITEMS.filter((i) => showSettings || i.href !== "/portal/settings").map(
        ({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
                active
                  ? "bg-surface text-fg shadow-card before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary"
                  : "text-fg-muted hover:bg-surface hover:text-fg"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        },
      )}
    </nav>
  );
}
