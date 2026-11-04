"use client";
import Link from "next/link";
import { useLang } from "@/lib/i18n/LangProvider";
import { Logo } from "@/components/ui/Logo";

/** FR-A10. Public source repository. */
const REPO_URL = "https://github.com/IKARUSops/3D-conversational-AI";

export function SiteFooter() {
  const { t } = useLang();
  return (
    <footer className="border-t border-border bg-navy-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between lg:px-8">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm text-fg-muted">{t.footer.tagline}</p>
          <p className="mt-4 inline-flex rounded-full border border-border px-3 py-1 text-xs text-fg-muted">
            {t.footer.demo}
          </p>
        </div>
        <ul className="space-y-3 text-sm">
          <li>
            <Link href="/portal/login" className="text-fg-muted hover:text-accent-fg">
              {t.footer.portal}
            </Link>
          </li>
          <li>
            <a
              href={REPO_URL}
              className="text-fg-muted hover:text-accent-fg"
              rel="noopener noreferrer"
              target="_blank"
            >
              {t.footer.repo}
            </a>
          </li>
        </ul>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-fg-subtle sm:px-6 lg:px-8">
        {t.footer.made}
      </p>
    </footer>
  );
}
