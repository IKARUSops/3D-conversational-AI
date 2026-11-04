/**
 * Google Gemini through the AI SDK. Thinking is off for latency
 * (providerOptions.google.thinkingConfig.thinkingBudget = 0, checked in @ai-sdk/google@4 types).
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LlmHandle } from "./types";

export function createGoogleLlm(modelId: string, apiKey: string): LlmHandle {
  const google = createGoogleGenerativeAI({ apiKey });
  // Gemini 3+ models use thinkingLevel; 2.x use thinkingBudget. Send the one that fits.
  const thinkingConfig = /^gemini-2\./.test(modelId)
    ? { thinkingBudget: 0 }
    : { thinkingLevel: "minimal" as const };
  return {
    id: `google:${modelId}`,
    vendor: "google",
    model: google(modelId),
    providerOptions: { google: { thinkingConfig } },
  };
}
