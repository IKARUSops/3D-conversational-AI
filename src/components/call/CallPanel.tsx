"use client";
/**
 * Call panel (FR-B1 to FR-B14, SRS 2 section 8.6). Styled with the design tokens (docs/DESIGN.md,
 * globals.css); state colours come from `.call-panel__state[data-phase]` in globals.css. Hooks:
 *   - root `.call-panel[data-phase=<CallUiState>]`
 *   - `.call-panel__*` element classes (BEM-like), `[data-speaker]` on captions
 * Pass `call` (from useCall) to share the same call with the 3D mascot.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  SttProviderId as STT_IDS,
  type CallLang,
  type ProvidersResponse,
  type SttProviderId,
  type TtsProviderId,
} from "@/contracts";
import { browserSttAvailable } from "./browserStt";
import { CALL_STRINGS } from "./callStrings";
import { formatClock, isLive } from "./callState";
import { useCall, type CallController } from "./useCall";

export interface CallPanelProps {
  lang?: CallLang;
  /** Shared controller (so the hero mascot can follow the call). One is created if omitted. */
  call?: CallController;
  clinicSlug?: string;
  reviewKey?: string;
  className?: string;
}

const FALLBACK_PROVIDERS: ProvidersResponse = {
  stt: [
    { id: "elevenlabs", label: "ElevenLabs Scribe", available: true, isDefault: true },
    { id: "openai", label: "OpenAI", available: true },
    { id: "azure", label: "Azure (bn-IN)", available: true },
    { id: "browser", label: "Browser (Chrome, bn-BD)", available: true },
  ],
  tts: [
    { id: "elevenlabs", label: "ElevenLabs (Nadia)", available: true, isDefault: true },
    { id: "openai", label: "OpenAI", available: true },
    { id: "azure", label: "Azure (bn-BD Nabanita)", available: true },
  ],
};

const MIC_ERRORS = new Set(["mic_denied", "mic_missing", "mic_busy", "mic_insecure"]);

export function CallPanel({
  lang = "bn",
  call: shared,
  clinicSlug,
  reviewKey,
  className,
}: CallPanelProps) {
  const own = useCall({ lang, clinicSlug, reviewKey });
  const call = shared ?? own;
  const { state } = call;
  const t = CALL_STRINGS[lang];
  const [providers, setProviders] = useState<ProvidersResponse>(FALLBACK_PROVIDERS);
  const [browserOk, setBrowserOk] = useState(true);
  const [showCaptions, setShowCaptions] = useState(true);
  const [typed, setTyped] = useState("");
  const captionsRef = useRef<HTMLOListElement>(null);
  const setCallProviders = call.setProviders;

  // Load provider availability; apply the browser allowlist (FR-B5) and `?stt=` (FR-B13).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/providers")
      .then((r) => (r.ok ? (r.json() as Promise<ProvidersResponse>) : FALLBACK_PROVIDERS))
      .catch(() => FALLBACK_PROVIDERS)
      .then((p) => {
        if (cancelled) return;
        const ok = browserSttAvailable();
        setProviders(p);
        setBrowserOk(ok);
        const fromUrl = new URLSearchParams(window.location.search).get("stt");
        const usable = (id: string) =>
          p.stt.some((o) => o.id === id && o.available) && (id !== "browser" || ok);
        let stt: SttProviderId | undefined;
        if (fromUrl && (STT_IDS as readonly string[]).includes(fromUrl) && usable(fromUrl))
          stt = fromUrl as SttProviderId;
        else
          stt = (p.stt.find((o) => o.isDefault && usable(o.id))?.id ??
            p.stt.find((o) => o.id !== "browser" && o.available)?.id ??
            (ok ? "browser" : "elevenlabs")) as SttProviderId;
        const tts =
          p.tts.find((o) => o.isDefault && o.available)?.id ?? p.tts.find((o) => o.available)?.id;
        setCallProviders({ ...(stt ? { stt } : {}), ...(tts ? { tts } : {}) });
      });
    return () => {
      cancelled = true;
    };
  }, [setCallProviders]);

  useEffect(() => {
    const el = captionsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.captions.length, state.interim]);

  const live = isLive(state.phase);
  const canConfigure = state.phase === "idle" || state.phase === "ended" || state.phase === "error";
  const busy = state.phase === "requesting_mic" || state.phase === "connecting";

  const onSend = (e: FormEvent) => {
    e.preventDefault();
    if (!typed.trim()) return;
    call.sendTyped(typed);
    setTyped("");
  };

  return (
    <section
      aria-label={t.title}
      data-phase={state.phase}
      className={`call-panel flex w-full flex-col gap-4 rounded-lg border border-border bg-surface p-5 text-fg shadow-card ${className ?? ""}`}
    >
      <header className="call-panel__header flex items-start justify-between gap-3 pr-11">
        <div>
          <h2 className="call-panel__title text-xl font-semibold">{t.title}</h2>
          <p className="call-panel__subtitle text-sm text-fg-muted">{t.subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p
            role="status"
            aria-live="polite"
            data-phase={state.phase}
            className="call-panel__state inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border-strong px-3 py-1 text-xs font-medium"
          >
            {t.states[state.phase]}
          </p>
          {(live || state.phase === "ending" || state.phase === "ended") && (
            <p className="call-panel__timer text-sm tabular-nums" aria-label={t.timerLabel}>
              <span>{formatClock(state.elapsedS)}</span>
              <span className="text-fg-subtle"> / {formatClock(state.maxSeconds)}</span>
            </p>
          )}
        </div>
      </header>

      {canConfigure && (
        <div className="call-panel__providers grid grid-cols-1 gap-3">
          <label className="call-panel__field flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">{t.sttLabel}</span>
            <select
              className="call-panel__select h-11 rounded-sm border border-border-strong bg-surface-2 px-2 text-fg"
              value={state.sttProvider}
              onChange={(e) => call.setProviders({ stt: e.target.value as SttProviderId })}
            >
              {providers.stt.map((o) => {
                const disabled = !o.available || (o.id === "browser" && !browserOk);
                const reason = o.id === "browser" && !browserOk ? "Chrome only" : o.reason;
                return (
                  <option key={o.id} value={o.id} disabled={disabled}>
                    {o.label}
                    {disabled && reason ? ` (${reason})` : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="call-panel__field flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">{t.ttsLabel}</span>
            <select
              className="call-panel__select h-11 rounded-sm border border-border-strong bg-surface-2 px-2 text-fg"
              value={state.ttsProvider}
              onChange={(e) => call.setProviders({ tts: e.target.value as TtsProviderId })}
            >
              {providers.tts.map((o) => (
                <option key={o.id} value={o.id} disabled={!o.available}>
                  {o.label}
                  {!o.available && o.reason ? ` (${o.reason})` : ""}
                </option>
              ))}
            </select>
          </label>
          {!browserOk && (
            <p className="call-panel__hint text-xs text-fg-subtle">
              {t.notices.browser_stt_unsupported}
            </p>
          )}
        </div>
      )}

      {state.phase === "error" && state.error && (
        <div
          role="alert"
          className="call-panel__error rounded-md border border-danger/60 bg-danger/10 p-3 text-sm"
        >
          <p className="font-medium">{state.error.message ?? t.errors[state.error.kind]}</p>
          {MIC_ERRORS.has(state.error.kind) && (
            <ol className="call-panel__mic-help mt-2 list-decimal pl-5 text-fg-muted">
              {t.micHelp.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      {(live || state.phase === "ending") && (
        <div className="call-panel__live flex flex-col gap-3">
          <div className="flex items-center justify-end">
            <button
              type="button"
              className="call-panel__captions-toggle text-xs text-link underline"
              aria-pressed={showCaptions}
              onClick={() => setShowCaptions((v) => !v)}
            >
              {showCaptions ? t.captionsHide : t.captionsShow}
            </button>
          </div>
          {showCaptions && (
            <ol
              ref={captionsRef}
              aria-live="polite"
              aria-relevant="additions"
              className="call-panel__captions flex max-h-64 flex-col gap-2 overflow-y-auto rounded-md bg-surface-2 p-3 text-sm"
            >
              {state.captions.map((c) => (
                <li key={c.id} data-speaker={c.speaker} className="call-panel__caption">
                  <span className="call-panel__speaker font-semibold">
                    {c.speaker === "agent" ? t.agent : t.you}:{" "}
                  </span>
                  <span>{c.text}</span>
                </li>
              ))}
              {state.interim && (
                <li
                  data-speaker="caller"
                  data-interim="true"
                  className="call-panel__caption italic text-fg-subtle"
                >
                  <span className="call-panel__speaker font-semibold">{t.you}: </span>
                  <span>{state.interim}</span>
                </li>
              )}
            </ol>
          )}
          {state.processing && (
            <p className="call-panel__processing text-xs text-fg-muted">{t.processing}</p>
          )}

          <form onSubmit={onSend} className="call-panel__typed flex gap-2">
            <label className="sr-only" htmlFor="call-panel-typed">
              {t.typeLabel}
            </label>
            <input
              id="call-panel-typed"
              className="call-panel__input h-11 min-w-0 flex-1 rounded-sm border border-border-strong bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-subtle"
              placeholder={t.typePlaceholder}
              value={typed}
              maxLength={1000}
              onChange={(e) => setTyped(e.target.value)}
              disabled={!live}
              autoComplete="off"
            />
            <button
              type="submit"
              className="call-panel__send h-11 rounded-md border border-border-strong px-4 text-sm font-medium transition-colors hover:bg-glass disabled:opacity-50"
              disabled={!live || !typed.trim()}
            >
              {t.send}
            </button>
          </form>
        </div>
      )}

      {state.notice && (live || canConfigure) && (
        <p className="call-panel__notice text-xs text-fg-muted" aria-live="polite">
          {t.notices[state.notice]}
        </p>
      )}

      {state.phase === "ended" && (
        <div className="call-panel__summary rounded-md border border-border bg-surface-2 p-4 text-sm">
          <h3 className="mb-1 font-semibold">{t.summaryTitle}</h3>
          <p>{state.summary ?? t.summaryFallback}</p>
          {state.endReason && <p className="mt-1 text-fg-muted">{t.endReasons[state.endReason]}</p>}
          {state.callId && (
            <a
              className="call-panel__portal-link mt-2 inline-block text-link underline"
              href={`/portal/calls/${state.callId}`}
            >
              {t.portalLink}
            </a>
          )}
        </div>
      )}

      <div className="call-panel__actions flex flex-col gap-2">
        {(canConfigure || busy) && (
          <>
            {state.phase === "idle" && (
              <p className="call-panel__tip text-xs text-fg-muted">{t.headphoneTip}</p>
            )}
            <button
              type="button"
              className="call-panel__start min-h-12 rounded-full bg-primary px-6 py-3 font-semibold text-on-primary transition-[background-color,box-shadow] hover:bg-primary-hover hover:shadow-glow disabled:opacity-60"
              onClick={() => call.start()}
              disabled={busy}
            >
              {state.phase === "error" ? t.tryAgain : state.phase === "ended" ? t.newCall : t.start}
            </button>
            <button
              type="button"
              className="call-panel__start-typing min-h-10 text-sm text-fg-muted underline hover:text-fg disabled:opacity-50"
              onClick={() => call.start({ textOnly: true })}
              disabled={busy}
            >
              {t.startTyping}
            </button>
          </>
        )}
        {(live || state.phase === "ending") && (
          <button
            type="button"
            className="call-panel__end min-h-12 rounded-full bg-state-error px-6 py-3 font-semibold text-navy-950 disabled:opacity-60"
            onClick={call.end}
            disabled={state.phase === "ending"}
          >
            {t.end}
          </button>
        )}
      </div>

      <p className="call-panel__demo text-xs text-fg-subtle">{t.demoNotice}</p>
    </section>
  );
}
