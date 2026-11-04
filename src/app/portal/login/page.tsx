/** Portal login (T3.1, FR-D1): Supabase email + password through a server action. */
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal login | ByteVoice Bangla" };

const ERRORS: Record<string, string> = {
  not_configured:
    "This server is not connected to the database or login service yet. Ask the admin to set the Supabase environment variables.",
  not_staff: "Your account is not linked to a clinic. Ask the clinic admin to add you.",
  error: "We could not check your session. Please sign in again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const errorKey = typeof sp.error === "string" ? sp.error : undefined;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const notice = errorKey ? ERRORS[errorKey] : undefined;

  return (
    <main className="grid min-h-dvh flex-1 bg-bg text-fg lg:grid-cols-[1.05fr_1fr]">
      <section
        data-theme="dark"
        className="relative hidden overflow-hidden bg-navy-900 p-12 text-fg lg:flex lg:flex-col lg:justify-between"
      >
        <Logo subtitle="Clinic portal" />
        <div className="relative z-10 max-w-md">
          <p className="text-sm font-medium text-accent-fg">Dhaka Dental Care demo clinic</p>
          <h2 className="mt-4 text-3xl leading-tight font-semibold">
            Every call, booking and callback in one calm place.
          </h2>
          <p className="mt-4 text-fg-muted">
            Byte answers in Bangla. You see the transcript, the extracted details and the outcome a
            few seconds after the caller hangs up.
          </p>
        </div>
        <Image
          src="/images/byte-still.webp"
          alt=""
          width={420}
          height={420}
          className="pointer-events-none absolute -right-6 bottom-0 w-[44%] max-w-sm opacity-95 select-none"
          priority
        />
        <p className="relative z-10 text-xs text-fg-subtle">Demo with fake data only.</p>
      </section>

      <section className="flex items-center justify-center px-4 py-16 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Logo subtitle="Clinic portal" />
          </div>
          <h1 className="mt-8 text-2xl font-semibold lg:mt-0">Sign in</h1>
          <p className="mt-1 text-sm text-fg-muted">Use the staff account your clinic gave you.</p>
          {notice ? (
            <p
              role="alert"
              className="mt-6 rounded-sm border border-border bg-status-incomplete-bg px-3 py-2 text-sm text-status-incomplete-fg"
            >
              {notice}
            </p>
          ) : null}
          <LoginForm next={next} />
          <p className="mt-8 text-sm text-fg-muted">
            <Link href="/" className="text-link underline-offset-4 hover:underline">
              Back to the website
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
