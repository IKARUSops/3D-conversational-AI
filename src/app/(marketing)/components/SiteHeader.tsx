"use client";
import Link from "next/link";
import { useLang } from "@/lib/i18n/LangProvider";
import { Logo } from "@/components/ui/Logo";

export function SiteHeader() {
  const { t, lang, setLang } = useLang();
  const links = [
    ["#how", t.nav.how],
    ["#features", t.nav.features],
    ["#use-cases", t.nav.useCases],
    ["#pricing", t.nav.pricing],
    ["#contact", t.nav.contact],
  ] as const;
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="ByteVoice Bangla" className="min-w-0 shrink rounded-md">
          <Logo />
        </Link>
        <nav aria-label={lang === "bn" ? "প্রধান" : "Main"} className="hidden lg:block">
          <ul className="flex items-center gap-7 text-sm text-fg-muted">
            {links.map(([href, label]) => (
              <li key={href}>
                <a href={href} className="transition-colors hover:text-fg">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="ভাষা / Language"
            className="flex rounded-full border border-border p-0.5 text-sm"
          >
            {(["bn", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                lang={l}
                className={`h-10 min-w-11 rounded-full px-3 font-medium transition-colors ${
                  lang === l ? "bg-primary text-on-primary" : "text-fg-muted hover:text-fg"
                }`}
              >
                {l === "bn" ? "বাংলা" : "EN"}
              </button>
            ))}
          </div>
          <Link
            href="/portal"
            className="inline-flex h-10 items-center rounded-full border border-border-strong px-3 text-sm font-medium hover:bg-glass sm:px-4"
          >
            {t.nav.portal}
          </Link>
        </div>
      </div>
    </header>
  );
}
