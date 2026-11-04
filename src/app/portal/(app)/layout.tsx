/**
 * Portal shell (T3.1): auth guard + sidebar + sign out. Every page below also calls
 * requireStaff() itself (layouts do not re-run on client navigation).
 */
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { Logo } from "@/components/ui/Logo";
import { IconLogout, IconMenu } from "@/components/ui/icons";
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
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-surface hover:text-fg"
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
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface-2 p-4 lg:flex">
        <Link href="/portal/calls" className="px-2 pt-1">
          <Logo subtitle="Dhaka Dental Care" />
        </Link>
        <div className="flex-1">
          <PortalNav showSettings={showSettings} />
        </div>
        {userBlock}
      </aside>

      <header className="sticky top-0 z-30 border-b border-border bg-surface-2/95 backdrop-blur lg:hidden">
        <details className="group">
          <summary className="flex h-14 cursor-pointer list-none items-center justify-between px-4 [&::-webkit-details-marker]:hidden">
            <Logo />
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md text-fg-muted">
              <IconMenu />
              <span className="sr-only">Open menu</span>
            </span>
          </summary>
          <div className="space-y-4 px-4 pb-4">
            <PortalNav showSettings={showSettings} />
            {userBlock}
          </div>
        </details>
      </header>

      <div className="flex min-w-0 flex-1 flex-col">
        {staff.readOnly ? (
          <p className="border-b border-border bg-status-follow-up-bg px-4 py-1.5 text-center text-xs text-status-follow-up-fg">
            Reviewer account: you can see everything; changes are turned off.
          </p>
        ) : null}
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
