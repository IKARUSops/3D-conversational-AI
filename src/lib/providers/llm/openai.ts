/** OpenAI chat model through the AI SDK (LLM fallback). */
import { createOpenAI } from "@ai-sdk/openai";
import type { LlmHandle } from "./types";

export function createOpenAiLlm(modelId: string, apiKey: string): LlmHandle {
  const openai = createOpenAI({ apiKey });
  return {
    id: `openai:${modelId}`,
    vendor: "openai",
    // Chat Completions API: plain, fast, supports tools and streaming.
    model: openai.chat(modelId),
    providerOptions: {},
  };
}
