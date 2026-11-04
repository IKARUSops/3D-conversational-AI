import type { LanguageModel } from "ai";
import type { LlmProviderId } from "@/contracts";

export interface LlmHandle {
  /** "google:gemini-2.5-flash" style id, stored in calls.llm_model. */
  id: string;
  vendor: LlmProviderId;
  model: LanguageModel;
  /** Passed to streamText/generateText `providerOptions`. */
  providerOptions: Record<string, Record<string, unknown>>;
}
