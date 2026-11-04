/**
 * Portal shell (T3.1): auth guard + sidebar + sign out. Every page below also calls
 * requireStaff() itself (layouts do not re-run on client navigation).
 */
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { Logo } from "@/components/ui/Logo";
import { IconLogout } from "@/components/ui/icons";
import { MobilePortalMenu } from "@/components/portal/MobilePortalMenu";
import { PortalNav } from "@/components/portal/PortalNav";
import { ThemeToggle } from "@/components/portal/ThemeToggle";
import { logoutAction } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function PortalAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const staff = await requireStaff();
  const roleLabel = staff.readOnly
    ? "Reviewer (read only)"
    : staff.role === "admin"
      ? "Admin"
      : "Receptionist";
  const showSettings = staff.role === "admin";

  const userBlock = (
    <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{staff.name}</p>
        <p className="truncate text-xs text-fg-subtle">{roleLabel}</p>
      </div>
      <div className="flex items-center">
        <ThemeToggle />
        <form action={logoutAction}>
          <button
            type="submit"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-fg-muted hover:bg-surface hover:text-fg"
            aria-label="Sign out"
            title="Sign out"
          >
            <IconLogout size={18} />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-bg text-fg lg:flex-row">
      <a
        href="#portal-main"
        className="sr-only z-50 rounded-md bg-surface px-4 py-2 text-sm font-medium text-fg shadow-card focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface-2 p-4 lg:flex">
        <Link href="/portal/calls" className="rounded-md px-2 pt-1" aria-label="ByteVoice portal home">
          <Logo subtitle="Dhaka Dental Care" />
        </Link>
        <div className="flex-1">
          <PortalNav showSettings={showSettings} />
        </div>
        {userBlock}
      </aside>

      <MobilePortalMenu
        brand={
          <Link href="/portal/calls" className="rounded-md" aria-label="ByteVoice portal home">
            <Logo />
          </Link>
        }
      >
        <PortalNav showSettings={showSettings} label="Portal (mobile)" />
        {userBlock}
      </MobilePortalMenu>

      <div className="flex min-w-0 flex-1 flex-col">
        {staff.readOnly ? (
          <p className="border-b border-border bg-status-follow-up-bg px-4 py-1.5 text-center text-xs text-status-follow-up-fg">
            Reviewer account: you can see everything; changes are turned off.
          </p>
        ) : null}
        <main
          id="portal-main"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
