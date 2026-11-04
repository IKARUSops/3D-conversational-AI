"use client";
import { useLang } from "@/lib/i18n/LangProvider";
import { CallLauncher } from "@/components/landing/CallLauncher";
import { useMascotBridge } from "@/components/landing/MascotBridge";
import { HeroVisual } from "@/components/three/HeroVisual";
import { IconMic } from "@/components/ui/icons";

/** Fades the desk into the page instead of a hard canvas edge. */
const MASK =
  "linear-gradient(to right, transparent, black 6%, black 86%, transparent), linear-gradient(to bottom, black 76%, transparent)";
const HERO_MASK: React.CSSProperties = {
  maskImage: MASK,
  maskComposite: "intersect",
  WebkitMaskImage: MASK,
  WebkitMaskComposite: "source-in",
};

/** FR-A2, FR-A3, FR-A4: headline + CTA on the left, Byte at her desk on the right. */
export function Hero() {
  const { t } = useLang();
  const { state, getAgentLevel, getCallerLevel } = useMascotBridge();
  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      {/* soft gold light behind the desk */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-[-10%] h-[42rem] w-[42rem] -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(245_183_0/0.16),transparent)]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 pt-10 pb-10 sm:px-6 md:pt-14 lg:grid-cols-[1fr_1.05fr] lg:gap-4 lg:px-8 lg:pt-8 lg:pb-12">
        <div className="max-w-xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-glass px-3 py-1 text-sm text-accent-fg">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-state-listening" />
            {t.hero.kicker}
          </p>
          <h1 id="hero-title" className="mt-5 text-display font-bold text-balance">
            {t.hero.title}
          </h1>
          <p className="mt-5 text-lg leading-[1.75] text-fg-muted">{t.hero.sub}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <CallLauncher />
            <a
              href="#how"
              className="inline-flex min-h-12 items-center justify-center rounded-full px-5 font-medium text-fg-muted transition-colors hover:text-fg"
            >
              {t.hero.secondary}
            </a>
          </div>
          <p className="mt-5 flex items-start gap-2 text-sm text-fg-subtle">
            <IconMic size={16} className="mt-1 shrink-0" />
            <span>
              {t.hero.headphones} {t.hero.note}
            </span>
          </p>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[34rem] lg:max-w-none">
          <div className="absolute inset-0" style={HERO_MASK}>
            <HeroVisual
              mascotState={state}
              getLevel={getAgentLevel}
              getCallerLevel={getCallerLevel}
              alt={t.hero.mascotAlt}
            />
          </div>
          {/* A real exchange, the thing Byte does all day */}
          <div
            className="pointer-events-none absolute top-[6%] left-0 max-w-[15rem] sm:left-[-4%]"
            aria-hidden="true"
          >
            <p className="glass bv-float rounded-lg rounded-bl-sm border-l-2 !border-l-state-listening px-4 py-2.5 text-sm leading-snug shadow-card">
              {t.hero.bubbleCaller}
            </p>
          </div>
          <div
            className="pointer-events-none absolute right-0 bottom-[7%] max-w-[16rem] sm:right-[-2%]"
            aria-hidden="true"
          >
            <p
              className="glass bv-float rounded-lg rounded-br-sm border-r-2 !border-r-state-speaking px-4 py-2.5 text-sm leading-snug shadow-card"
              style={{ animationDelay: "-3s" }}
            >
              {t.hero.bubbleAgent}
            </p>
          </div>
        </div>
      </div>

      <div className="relative border-y border-border bg-navy-950/60">
        <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 sm:px-6 md:grid-cols-4 lg:px-8">
          {t.hero.chips.map((chip, i) => (
            <li
              key={chip}
              className="flex items-center gap-3 py-4 text-sm font-medium md:justify-center"
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${["bg-state-speaking", "bg-state-listening", "bg-state-thinking", "bg-fg-muted"][i]}`}
              />
              {chip}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
