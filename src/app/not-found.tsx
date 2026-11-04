import Link from "next/link";

export const metadata = { title: "Page not found | ByteVoice Bangla" };

/** 404 for every route (landing and portal). Bilingual, short. */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh flex-1 place-items-center bg-bg px-4 text-fg">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-fg-subtle">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">পেজটি পাওয়া যায়নি</h1>
        <p className="mt-1 text-fg-muted">This page does not exist.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
          >
            হোম পেজে যান
          </Link>
          <Link
            href="/portal"
            className="inline-flex h-11 items-center rounded-md border border-border-strong px-5 text-sm font-medium hover:bg-surface-2"
          >
            Portal
          </Link>
        </div>
      </div>
    </main>
  );
}
