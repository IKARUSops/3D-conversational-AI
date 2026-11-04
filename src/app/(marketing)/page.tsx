/**
 * Landing page (Agent D, FR-A1 to FR-A10). Always the dark brand theme (docs/DESIGN.md).
 */
import { LangProvider } from "@/lib/i18n/LangProvider";
import { MascotBridgeProvider } from "@/components/landing/MascotBridge";
import { Contact } from "./components/Contact";
import { Features } from "./components/Features";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { Pricing } from "./components/Pricing";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { UseCases } from "./components/UseCases";

export default function LandingPage() {
  return (
    <LangProvider>
      <MascotBridgeProvider>
        <div
          data-theme="dark"
          className="flex min-h-dvh flex-1 flex-col overflow-x-clip bg-bg text-fg"
        >
          <a
            href="#main"
            className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="main" className="flex-1">
            <Hero />
            <HowItWorks />
            <Features />
            <UseCases />
            <Pricing />
            <Contact />
          </main>
          <SiteFooter />
        </div>
      </MascotBridgeProvider>
    </LangProvider>
  );
}
