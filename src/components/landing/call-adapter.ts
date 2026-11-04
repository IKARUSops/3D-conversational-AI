/**
 * Call panel adapter (merge point with Agent B, done in I-01).
 * The default export is HeroCallPanel: Agent B's CallPanel + useCall in a hero dialog that feeds
 * the mascot through MascotBridge. Props contract: docs/DECISIONS.md D-C04.
 */
import type { Lang } from "@/lib/i18n/dictionary";
import type { MascotSignal } from "./MascotBridge";

export interface CallPanelProps {
  open: boolean;
  /** Close the panel. CallPanel ends any live call first (FR-B8). */
  onClose: () => void;
  /** Current landing language, used for labels and the agent's reply language. */
  lang: Lang;
  /**
   * Called when the mascot state changes and once with the level getters:
   * { state: mascotState, getAgentLevel, getCallerLevel } from useCall.
   */
  onMascotChange: (signal: Partial<MascotSignal>) => void;
}

export { HeroCallPanel as default } from "./HeroCallPanel";
