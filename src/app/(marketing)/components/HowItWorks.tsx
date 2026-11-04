"use client";
import { useLang } from "@/lib/i18n/LangProvider";

const DIGITS = { bn: ["১", "২", "৩"], en: ["1", "2", "3"] };

/** FR-A7: three real steps, so they are numbered. */
export function HowItWorks() {
  const { t, lang } = useLang();
  return (
    <section id="how" className="scroll-mt-20 py-20 md:py-28" aria-labelledby="how-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 id="how-title" className="text-3xl font-bold md:text-4xl">
            {t.how.title}
          </h2>
          <p className="mt-3 text-lg text-fg-muted">{t.how.sub}</p>
        </div>
        <ol className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          <span
            aria-hidden="true"
            className="absolute top-6 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-gold-500/0 via-gold-500/50 to-gold-500/0 md:block"
          />
          {t.how.steps.map((step, i) => (
            <li key={step.title} className="relative">
              <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-gold-500/50 bg-navy-900 text-xl font-bold text-accent-fg">
                {DIGITS[lang][i]}
              </span>
              <h3 className="mt-5 text-xl font-semibold">{step.title}</h3>
              <p className="mt-2 leading-relaxed text-fg-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
