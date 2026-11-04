"use client";
/**
 * Shares the live call signal between the call panel and the hero mascot (FR-A4).
 *
 * The call panel (Agent B, src/components/call/CallPanel.tsx) reports its `mascotState` and
 * the two level getters through `onMascotChange`. The mascot reads them every frame, so
 * level changes never re-render React; only state changes do.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export type MascotState = "idle" | "listening" | "thinking" | "speaking";

export interface MascotSignal {
  state: MascotState;
  /** Agent (TTS) audio level 0..1, drives BeakOpen and the screen waveform while speaking. */
  getAgentLevel: () => number;
  /** Caller microphone level 0..1, drives the screen waveform while listening. */
  getCallerLevel: () => number;
}

interface BridgeValue {
  state: MascotState;
  getAgentLevel: () => number;
  getCallerLevel: () => number;
  setSignal: (signal: Partial<MascotSignal>) => void;
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
}

const zero = () => 0;
const BridgeContext = createContext<BridgeValue | null>(null);

export function MascotBridgeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MascotState>("idle");
  const [panelOpen, setPanelOpen] = useState(false);
  const agentRef = useRef<() => number>(zero);
  const callerRef = useRef<() => number>(zero);

  const setSignal = useCallback((signal: Partial<MascotSignal>) => {
    if (signal.getAgentLevel) agentRef.current = signal.getAgentLevel;
    if (signal.getCallerLevel) callerRef.current = signal.getCallerLevel;
    if (signal.state) setState(signal.state);
  }, []);

  const value = useMemo<BridgeValue>(
    () => ({
      state,
      getAgentLevel: () => agentRef.current(),
      getCallerLevel: () => callerRef.current(),
      setSignal,
      panelOpen,
      openPanel: () => setPanelOpen(true),
      closePanel: () => {
        setPanelOpen(false);
        agentRef.current = zero;
        callerRef.current = zero;
        setState("idle");
      },
    }),
    [state, panelOpen, setSignal],
  );
  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}

export function useMascotBridge(): BridgeValue {
  const ctx = useContext(BridgeContext);
  if (!ctx) throw new Error("useMascotBridge must be used inside <MascotBridgeProvider>");
  return ctx;
}
