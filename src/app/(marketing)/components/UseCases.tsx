"use client";
import { useLang } from "@/lib/i18n/LangProvider";
import { IconBell, IconHospital, IconMicroscope, IconTooth } from "@/components/ui/icons";

const ICONS = [IconTooth, IconMicroscope, IconHospital, IconBell];

export function UseCases() {
  const { t } = useLang();
  return (
    <section id="use-cases" className="scroll-mt-20 py-20 md:py-28" aria-labelledby="use-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 id="use-title" className="text-3xl font-bold md:text-4xl">
          {t.useCases.title}
        </h2>
        <ul className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {t.useCases.items.map((item, i) => {
            const Icon = ICONS[i]!;
            const soon = i === 3;
            return (
              <li key={item.title} className="flex gap-5 border-t border-border pt-6">
                <Icon size={28} className="shrink-0 text-accent-fg" />
                <div>
                  <h3 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
                    {item.title}
                    {soon ? (
                      <span className="rounded-full border border-border-strong px-2 py-0.5 text-xs font-medium text-fg-muted">
                        {t.useCases.soon}
                      </span>
                    ) : null}
                  </h3>
                  <p className="mt-2 text-fg-muted">{item.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
