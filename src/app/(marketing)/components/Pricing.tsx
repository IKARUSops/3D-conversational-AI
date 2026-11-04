"use client";
import { useLang } from "@/lib/i18n/LangProvider";
import { IconCheck } from "@/components/ui/icons";

/** FR-A7 pricing: illustrative only, clearly labelled. */
export function Pricing() {
  const { t } = useLang();
  return (
    <section
      id="pricing"
      className="scroll-mt-20 bg-navy-950/50 py-20 md:py-28"
      aria-labelledby="pricing-title"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="pricing-title" className="text-3xl font-bold md:text-4xl">
            {t.pricing.title}
          </h2>
          <p className="text-sm text-fg-subtle">{t.pricing.note}</p>
        </div>
        <ul className="mt-12 grid gap-6 md:grid-cols-3 md:items-stretch">
          {t.pricing.plans.map((plan, i) => {
            const featured = i === 1;
            const numeric = /\d/.test(plan.price);
            return (
              <li
                key={plan.name}
                className={`flex flex-col rounded-lg p-6 sm:p-7 ${
                  featured ? "glass shadow-glow !border-gold-500/50" : "border border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xl font-semibold">{plan.name}</h3>
                  {featured ? (
                    <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-on-primary">
                      {t.pricing.popular}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-fg-muted">{plan.desc}</p>
                <p className="mt-6 text-3xl font-bold">
                  {plan.price}
                  {numeric ? (
                    <span className="text-base font-normal text-fg-muted">
                      {t.pricing.perMonth}
                    </span>
                  ) : null}
                </p>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {plan.points.map((p) => (
                    <li key={p} className="flex gap-2.5">
                      <IconCheck size={18} className="mt-0.5 shrink-0 text-accent-fg" />
                      {p}
                    </li>
                  ))}
                </ul>
                <a
                  href="#contact"
                  className={`mt-8 inline-flex h-11 items-center justify-center rounded-full font-semibold transition-colors ${
                    featured
                      ? "bg-primary text-on-primary hover:bg-primary-hover"
                      : "border border-border-strong hover:bg-glass"
                  }`}
                >
                  {t.pricing.choose}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
