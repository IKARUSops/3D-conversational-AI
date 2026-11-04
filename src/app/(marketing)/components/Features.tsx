"use client";
import { useLang } from "@/lib/i18n/LangProvider";
import { IconCalendar, IconCallback, IconClock, IconLayout } from "@/components/ui/icons";

const ICONS = [IconClock, IconCalendar, IconCallback, IconLayout];

/** FR-A7 features: one lead feature with a real exchange, then a quiet list. */
export function Features() {
  const { t } = useLang();
  return (
    <section
      id="features"
      className="scroll-mt-20 bg-navy-950/50 py-20 md:py-28"
      aria-labelledby="features-title"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 id="features-title" className="max-w-2xl text-3xl font-bold md:text-4xl">
          {t.features.title}
        </h2>
        <div className="mt-12 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div className="glass rounded-lg p-6 sm:p-8">
            <h3 className="text-2xl font-semibold">{t.features.leadTitle}</h3>
            <p className="mt-3 leading-relaxed text-fg-muted">{t.features.leadBody}</p>
            <div className="mt-8 space-y-3" aria-label="Sample conversation">
              <div className="flex">
                <p className="max-w-[85%] rounded-lg rounded-bl-sm border border-state-listening/40 bg-state-listening/10 px-4 py-3">
                  {t.features.sampleCaller}
                </p>
              </div>
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-lg rounded-br-sm border border-state-speaking/40 bg-state-speaking/10 px-4 py-3">
                  {t.features.sampleAgent}
                </p>
              </div>
            </div>
          </div>
          <ul className="divide-y divide-border self-center">
            {t.features.items.map((item, i) => {
              const Icon = ICONS[i]!;
              return (
                <li key={item.title} className="flex gap-4 py-5 first:pt-0 last:pb-0">
                  <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gold-500/10 text-accent-fg">
                    <Icon size={20} />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">{item.title}</h3>
                    <p className="mt-1 text-fg-muted">{item.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
