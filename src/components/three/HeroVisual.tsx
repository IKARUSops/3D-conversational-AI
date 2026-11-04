"use client";
/**
 * Hero 3D with fallbacks (T4.2, FR-A4, FR-A5). Order:
 *   1. ByteMascot (byte.glb), lazy-loaded after first paint.
 *   2. VoiceOrb if the model fails to load.
 *   3. Still image if WebGL is missing or the 3D crashes. The still is also the loading state.
 * Rendering pauses when the hero is off screen.
 */
import dynamic from "next/dynamic";
import Image from "next/image";
import { Component, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MascotProps } from "./ByteMascot";

function LoadingStill() {
  return (
    <Image
      src="/images/byte-still.webp"
      alt=""
      fill
      priority
      sizes="(min-width: 1024px) 560px, 90vw"
      className="object-contain"
    />
  );
}

const ByteMascot = dynamic(() => import("./ByteMascot"), { ssr: false, loading: LoadingStill });
const VoiceOrb = dynamic(() => import("./VoiceOrb"), { ssr: false, loading: LoadingStill });

class Boundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[hero] 3D fallback:", error instanceof Error ? error.message : error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

const noop = () => () => {};
function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function HeroVisual({
  mascotState,
  getLevel,
  getCallerLevel,
  alt,
}: Omit<MascotProps, "reducedMotion"> & { alt: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);
  const webgl = useSyncExternalStore(noop, hasWebGL, () => false);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setActive(Boolean(entry?.isIntersecting)), {
      rootMargin: "100px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const still = (
    <Image
      src="/images/byte-still.webp"
      alt={alt}
      fill
      priority
      sizes="(min-width: 1024px) 560px, 90vw"
      className="object-contain"
    />
  );
  const props = { mascotState, getLevel, getCallerLevel, reducedMotion, active };

  return (
    <div ref={wrap} className="relative h-full w-full">
      {webgl ? (
        <Boundary fallback={still}>
          <Suspense fallback={still}>
            <Boundary
              fallback={
                <Boundary fallback={still}>
                  <VoiceOrb {...props} />
                </Boundary>
              }
            >
              <ByteMascot {...props} />
            </Boundary>
          </Suspense>
        </Boundary>
      ) : (
        still
      )}
      {webgl ? <span className="sr-only">{alt}</span> : null}
    </div>
  );
}
