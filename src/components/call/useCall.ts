"use client";
/**
 * React hook for the voice call (SRS 2 section 8.1).
 *
 * const call = useCall({ lang: "bn" });
 * call.state.phase        // CallUiState for the panel
 * call.mascotState        // 'idle' | 'listening' | 'thinking' | 'speaking' for the 3D hero
 * call.getAgentLevel()    // 0..1 agent voice level (call every animation frame)
 * call.getCallerLevel()   // 0..1 caller mic level
 * call.start(); call.end(); call.sendTyped("..."); call.setProviders({ stt, tts })
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { CallLang, MascotState, SttProviderId, TtsProviderId } from "@/contracts";
import { CallSession } from "./callSession";
import { callReducer, initialCallState, isLive, mascotStateFor, type CallAction, type CallState } from "./callState";

export interface UseCallOptions {
  lang?: CallLang;
  clinicSlug?: string;
  /** Reviewer key from `/?key=` (FR-B12). */
  reviewKey?: string;
  initialStt?: SttProviderId;
  initialTts?: TtsProviderId;
}

export interface CallController {
  state: CallState;
  mascotState: MascotState;
  isLive: boolean;
  /** `textOnly`: typed chat without a microphone (FR-B13). */
  start: (opts?: { textOnly?: boolean }) => void;
  end: () => void;
  sendTyped: (text: string) => void;
  setProviders: (p: { stt?: SttProviderId; tts?: TtsProviderId }) => void;
  reset: () => void;
  getAgentLevel: () => number;
  getCallerLevel: () => number;
}

export function useCall(options: UseCallOptions = {}): CallController {
  const [state, rawDispatch] = useReducer(callReducer, options, (o) =>
    initialCallState({ lang: o.lang, sttProvider: o.initialStt, ttsProvider: o.initialTts }),
  );
  const sessionRef = useRef<CallSession | null>(null);
  const stateRef = useRef(state);
  const optsRef = useRef(options);

  useEffect(() => {
    stateRef.current = state;
    optsRef.current = options;
  });

  const dispatch = useCallback((a: CallAction) => {
    if (process.env.NODE_ENV === "development" && a.type !== "TICK" && a.type !== "INTERIM") {
      console.debug("[call]", a.type, a);
    }
    rawDispatch(a);
  }, []);

  const start = useCallback((startOpts?: { textOnly?: boolean }) => {
    const cur = sessionRef.current;
    if (cur && !cur.isFinished()) return;
    const o = optsRef.current;
    const session = new CallSession(dispatch, { lang: o.lang ?? "bn", clinicSlug: o.clinicSlug, reviewKey: o.reviewKey });
    sessionRef.current = session;
    void session.start(stateRef.current.sttProvider, stateRef.current.ttsProvider, startOpts);
  }, [dispatch]);

  const end = useCallback(() => {
    void sessionRef.current?.end("caller_hangup");
  }, []);

  const sendTyped = useCallback((text: string) => sessionRef.current?.sendTyped(text), []);

  const setProviders = useCallback(
    (p: { stt?: SttProviderId; tts?: TtsProviderId }) => dispatch({ type: "SET_PROVIDERS", ...p }),
    [dispatch],
  );

  const reset = useCallback(() => dispatch({ type: "RESET" }), [dispatch]);
  const getAgentLevel = useCallback(() => sessionRef.current?.getAgentLevel() ?? 0, []);
  const getCallerLevel = useCallback(() => sessionRef.current?.getCallerLevel() ?? 0, []);

  // Closing the panel / leaving the page ends the call (FR-B8).
  useEffect(() => () => void sessionRef.current?.end("caller_hangup"), []);

  return useMemo(
    () => ({
      state,
      mascotState: mascotStateFor(state.phase),
      isLive: isLive(state.phase),
      start,
      end,
      sendTyped,
      setProviders,
      reset,
      getAgentLevel,
      getCallerLevel,
    }),
    [state, start, end, sendTyped, setProviders, reset, getAgentLevel, getCallerLevel],
  );
}
