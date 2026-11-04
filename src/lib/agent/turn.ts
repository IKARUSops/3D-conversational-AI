/**
 * Turn loop (SRS 2 section 7.1). One caller turn in, a stream of TurnEvents out:
 * sentences (with speakable ttsText), tool status, at most one filler, end_call, done.
 *
 * - Only the latest turnSeq is accepted (stale_turn); req.signal aborts the LLM.
 * - History window: last 20 live turns + "what we know" state in the system prompt.
 * - LLM: primary, and if no first token in 4 s (or an error before any output) the fallback.
 */
import { hasToolCall, stepCountIs, streamText, type ModelMessage, type TextStreamPart, type ToolSet } from "ai";
import type { AgentState, ApiErrorCode, CallLang, ToolName, TurnEvent, TurnRequestParsed } from "@/contracts";
import { MAX_SILENCE_PROMPTS } from "@/contracts";
import type { LlmHandle } from "@/lib/providers/llm/types";
import { PROVIDER_TIMEOUTS_MS } from "@/lib/providers/types";
import type { ClinicContext } from "@/lib/services";
import { nfc } from "@/lib/text/normalize";
import { SentenceSplitter } from "@/lib/text/sentence-split";
import { captionText, ttsNormalize } from "@/lib/text/tts-normalize";
import { FIXED_LINES, buildSystemPrompt } from "./system-prompt";
import { parseAgentState } from "./state";
import type { CallRow, TurnStore } from "./store";
import { createAgentTools, type AgentServices, type ToolTracker } from "./tools";

export const HISTORY_WINDOW = 20;
export const MAX_STEPS = 4;
export const MAX_OUTPUT_TOKENS = 200;

/** Tools slow enough to deserve a filler line before the first sentence. */
const FILLER_TOOLS = new Set<string>([
  "check_availability",
  "book_appointment",
  "find_appointments",
  "reschedule_appointment",
  "cancel_appointment",
  "create_callback",
]);

export interface TurnDeps {
  store: TurnStore;
  loadClinic: (clinicId: string) => Promise<ClinicContext>;
  llms: LlmHandle[];
  services: AgentServices;
  now?: () => Date;
  firstTokenTimeoutMs?: number;
}

export type PrepareResult =
  | { ok: true; call: CallRow; state: AgentState }
  | { ok: false; code: ApiErrorCode; message: string };

/** Load the call, check ownership/ended/stale, and claim this turnSeq. */
export async function prepareTurn(
  callId: string,
  clinicId: string,
  body: TurnRequestParsed,
  store: TurnStore,
): Promise<PrepareResult> {
  const call = await store.loadCall(callId);
  if (!call) return { ok: false, code: "not_found", message: "Call not found" };
  if (call.clinicId !== clinicId) return { ok: false, code: "unauthorized", message: "Token does not match this call" };
  if (call.endedAt) return { ok: false, code: "call_ended", message: "This call has ended" };
  const state = parseAgentState(call.agentState, call.lang);
  if (state.ended) return { ok: false, code: "call_ended", message: "This call has ended" };
  if (state.lastTurnSeq !== undefined && body.turnSeq <= state.lastTurnSeq) {
    return { ok: false, code: "stale_turn", message: "A newer turn exists" };
  }
  state.lastTurnSeq = body.turnSeq;
  await store.saveState(callId, state);
  return { ok: true, call, state };
}

/** Language of a sentence for TTS normalisation. */
function sentenceLang(text: string, fallback: CallLang): CallLang {
  if (/[ঀ-৿]/.test(text)) return "bn";
  return /[A-Za-z]/.test(text) ? "en" : fallback;
}

/** Build model messages from history (caller -> user, agent -> assistant). */
export function historyToMessages(history: Array<{ speaker: string; text: string }>): ModelMessage[] {
  const msgs: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const h of history) {
    if (h.speaker === "system" || !h.text.trim()) continue;
    const role = h.speaker === "caller" ? "user" : "assistant";
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += `\n${h.text}`;
    else msgs.push({ role, content: h.text });
  }
  if (msgs[0]?.role === "assistant") msgs.unshift({ role: "user", content: "[CALL CONNECTED]" });
  return msgs;
}

type Part = TextStreamPart<ToolSet>;

function isMeaningful(p: Part): boolean {
  return (p.type === "text-delta" && p.text.length > 0) || p.type === "tool-input-start" || p.type === "tool-call";
}

/**
 * Stream from the first LLM that produces a first token in time. Yields parts of the winner.
 * Calls `onSwitch(from, to, reason)` on each fallback.
 */
export async function* streamWithFallback(
  llms: LlmHandle[],
  start: (llm: LlmHandle, signal: AbortSignal) => AsyncIterable<Part>,
  opts: { signal: AbortSignal; firstTokenMs: number; onSwitch: (from: string, to: string | null, reason: string) => void },
): AsyncGenerator<{ llm: LlmHandle; part: Part; firstTokenAt?: number }> {
  for (let i = 0; i < llms.length; i++) {
    const llm = llms[i]!;
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort(opts.signal.reason);
    opts.signal.addEventListener("abort", onAbort, { once: true });
    const it = start(llm, ctrl.signal)[Symbol.asyncIterator]();
    const buffered: Part[] = [];
    let reason: string | null = null;
    const deadline = Date.now() + opts.firstTokenMs;
    try {
      for (;;) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<"timeout">((r) => {
          timer = setTimeout(() => r("timeout"), Math.max(0, deadline - Date.now()));
        });
        const next = await Promise.race([it.next(), timeout]);
        clearTimeout(timer);
        if (next === "timeout") {
          reason = `no first token in ${opts.firstTokenMs} ms`;
          break;
        }
        if (next.done) {
          reason = "empty response";
          break;
        }
        const part = next.value;
        if (part.type === "error") {
          reason = part.error instanceof Error ? part.error.message.slice(0, 200) : String(part.error).slice(0, 200);
          break;
        }
        if (part.type === "abort") {
          reason = "aborted";
          break;
        }
        buffered.push(part);
        if (isMeaningful(part)) break;
      }
    } catch (err) {
      reason = err instanceof Error ? err.message.slice(0, 200) : String(err);
    }
    if (opts.signal.aborted) {
      opts.signal.removeEventListener("abort", onAbort);
      ctrl.abort();
      return;
    }
    if (reason === null) {
      const firstTokenAt = Date.now();
      for (const [k, part] of buffered.entries()) yield { llm, part, ...(k === buffered.length - 1 ? { firstTokenAt } : {}) };
      try {
        for (;;) {
          const next = await it.next();
          if (next.done) break;
          yield { llm, part: next.value };
        }
      } finally {
        opts.signal.removeEventListener("abort", onAbort);
      }
      return;
    }
    ctrl.abort(new Error(reason));
    opts.signal.removeEventListener("abort", onAbort);
    void it.return?.(undefined)?.catch?.(() => undefined);
    opts.onSwitch(llm.id, llms[i + 1]?.id ?? null, reason);
  }
  throw new Error("all_llms_failed");
}

export interface RunTurnArgs {
  callId: string;
  clinicId: string;
  call: CallRow;
  state: AgentState;
  body: TurnRequestParsed;
  signal: AbortSignal;
}

/** Runs one turn and emits SSE events. Never throws (errors become `error` events). */
export async function runTurn(args: RunTurnArgs, deps: TurnDeps, emit: (e: TurnEvent) => void): Promise<void> {
  const { callId, clinicId, call, body, signal } = args;
  const now = deps.now ?? (() => new Date());
  const svc = deps.services;
  const t0 = Date.now();
  const holder = { state: args.state };
  const lang: CallLang = holder.state.lang;
  const lines = FIXED_LINES[lang];
  const sentences: string[] = [];
  let firstSentenceMs: number | undefined;
  let firstTokenMs = 0;
  let llmModel: string | undefined;
  const tracker: ToolTracker = { called: new Set<ToolName>(), pending: [] };
  const msFromStart = () => now().getTime() - call.startedAt.getTime();
  const live = () => !signal.aborted;

  const sendSentence = (raw: string) => {
    const text = captionText(raw);
    if (!text || !live()) return;
    const seq = holder.state.nextAgentSeq ?? 0;
    holder.state = { ...holder.state, nextAgentSeq: seq + 1 };
    sentences.push(text);
    firstSentenceMs ??= Date.now() - t0;
    emit({ type: "sentence", seq, text, ttsText: ttsNormalize(text, sentenceLang(text, lang)) });
  };

  const finish = async () => {
    // An aborted turn (barge-in / newer turn) is saved by the next turn as the spoken prefix.
    if (sentences.length > 0 && live()) {
      await deps.store
        .saveTurn(callId, { speaker: "agent", text: sentences.join(" "), startedMs: msFromStart() })
        .catch((e) => console.error("[turn] save agent turn", e));
    }
    await deps.store.saveState(callId, holder.state, llmModel ? { llmModel } : undefined).catch((e) => console.error("[turn] save state", e));
    await Promise.allSettled(tracker.pending);
    const totalMs = Date.now() - t0;
    await svc.logEvent(callId, "turn_latency", {
      turnSeq: body.turnSeq,
      firstTokenMs,
      ...(firstSentenceMs !== undefined ? { firstSentenceMs } : {}),
      totalMs,
    });
    if (!live()) return;
    if (holder.state.ended) emit({ type: "end_call", reason: holder.state.ended.reason, summary: holder.state.ended.summaryBn });
    emit({
      type: "done",
      turnId: `${callId}:${body.turnSeq}`,
      latency: { firstTokenMs, ...(firstSentenceMs !== undefined ? { firstSentenceMs } : {}), totalMs },
    });
  };

  try {
    // 1. Barge-in: keep only what was actually spoken (FR-C17).
    if (body.interruptedAgentSeq !== undefined) {
      await deps.store.recordInterruption(callId, body.spokenPrefix ?? "", msFromStart());
      tracker.pending.push(svc.logEvent(callId, "interruption", { agentSeq: body.interruptedAgentSeq, spokenPrefix: body.spokenPrefix ?? "" }));
    }
    if (body.echoFilteredCount) tracker.pending.push(svc.logEvent(callId, "echo_filtered", { count: body.echoFilteredCount }));

    // 2. Silence prompts are fixed lines, no LLM (FR-C16).
    if (body.event === "silence") {
      const n = holder.state.silencePrompts + 1;
      holder.state = { ...holder.state, silencePrompts: n };
      tracker.pending.push(svc.logEvent(callId, "silence_prompt", { n }));
      if (n > MAX_SILENCE_PROMPTS) {
        sendSentence(lines.silenceEnd);
        holder.state = { ...holder.state, ended: { reason: "silence", summaryBn: "কলার কোনো উত্তর দেননি, তাই কল শেষ করা হয়েছে।" } };
      } else sendSentence(n === 1 ? lines.silence1 : lines.silence2);
      await finish();
      return;
    }

    let extraUser: string | undefined;
    if (body.event === "time_warning") {
      tracker.pending.push(svc.logEvent(callId, "time_warning", {}));
      extraUser = "[TIME_WARNING] The call time is almost over. Say so in one short sentence, summarise what was agreed, say goodbye and call end_call.";
    } else {
      const text = nfc(body.text).trim();
      await deps.store.saveTurn(callId, {
        speaker: "caller",
        text,
        startedMs: msFromStart(),
        inputMode: body.inputMode,
        ...(body.sttConfidence !== undefined ? { sttConfidence: body.sttConfidence } : {}),
      });
      holder.state = { ...holder.state, silencePrompts: 0 };
    }

    // 3. Prompt + history.
    const [clinic, history] = await Promise.all([deps.loadClinic(clinicId), deps.store.loadHistory(callId, HISTORY_WINDOW)]);
    const messages = historyToMessages(history);
    if (extraUser) messages.push({ role: "user", content: extraUser });
    if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
      messages.push({ role: "user", content: nfc(body.text) || "[CONTINUE]" });
    }

    const tools = createAgentTools(
      { callId, clinicId, clinic, lang, now, holder, services: svc },
      tracker,
    );

    if (deps.llms.length === 0) throw new Error("no LLM configured");

    // 4. Stream with first-token fallback.
    const splitter = new SentenceSplitter();
    let fillerSent = false;
    const parts = streamWithFallback(
      deps.llms,
      (llm, abortSignal) =>
        streamText({
          model: llm.model,
          instructions: buildSystemPrompt({ clinic, state: holder.state, now: now(), lang }),
          messages,
          tools,
          stopWhen: [stepCountIs(MAX_STEPS), hasToolCall("end_call")],
          temperature: 0.3,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          maxRetries: 0,
          abortSignal,
          providerOptions: llm.providerOptions as never,
        }).fullStream as AsyncIterable<Part>,
      {
        signal,
        firstTokenMs: deps.firstTokenTimeoutMs ?? PROVIDER_TIMEOUTS_MS.llmFirstToken,
        onSwitch: (from, to, reason) => {
          tracker.pending.push(
            to
              ? svc.logEvent(callId, "provider_fallback", { kind: "llm", from, to, reason })
              : svc.logEvent(callId, "llm_error", { model: from, reason }),
          );
        },
      },
    );

    let failed = false;
    try {
      for await (const { llm, part, firstTokenAt } of parts) {
        if (!live()) break;
        llmModel = llm.id;
        if (firstTokenAt !== undefined) firstTokenMs = firstTokenAt - t0;
        switch (part.type) {
          case "text-delta":
            for (const s of splitter.push(part.text)) sendSentence(s);
            break;
          case "tool-input-start":
          case "tool-call": {
            for (const s of splitter.flush()) sendSentence(s);
            if (part.type === "tool-call") {
              emit({ type: "tool", name: part.toolName, status: "start" });
              if (!fillerSent && sentences.length === 0 && FILLER_TOOLS.has(part.toolName)) {
                fillerSent = true;
                emit({ type: "filler", ttsText: lines.filler });
              }
            }
            break;
          }
          case "tool-result": {
            const out = part.output as Record<string, unknown> | null;
            const bad = !!out && typeof out === "object" && (out.ok === false || "error" in out);
            emit({ type: "tool", name: part.toolName, status: bad ? "error" : "ok" });
            break;
          }
          case "tool-error":
            emit({ type: "tool", name: part.toolName, status: "error" });
            break;
          case "finish-step":
            for (const s of splitter.flush()) sendSentence(s);
            break;
          case "error":
            failed = true;
            tracker.pending.push(svc.logEvent(callId, "llm_error", { model: llm.id, reason: String(part.error).slice(0, 200) }));
            break;
          default:
            break;
        }
        if (failed) break;
      }
    } catch (err) {
      if (live()) {
        tracker.pending.push(svc.logEvent(callId, "llm_error", { reason: err instanceof Error ? err.message : String(err) }));
        if (sentences.length === 0) {
          sendSentence(lines.technical);
          emit({ type: "error", code: "all_providers_failed", message: "The assistant is not available right now" });
        }
      }
    }
    for (const s of splitter.flush()) sendSentence(s);

    // 5. Nothing usable: say sorry (or goodbye when the call was ended by a tool).
    if (sentences.length === 0 && live()) {
      if (holder.state.ended) sendSentence(lines.goodbye);
      else {
        sendSentence(lines.sorry);
        tracker.pending.push(svc.logEvent(callId, "llm_error", { reason: "no text in reply" }));
      }
    }

    // 6. Off-topic streak counts turns in a row (FR-C12).
    if (!body.event && !tracker.called.has("flag_off_topic") && holder.state.offTopicStreak > 0) {
      holder.state = { ...holder.state, offTopicStreak: 0 };
    }
    await finish();
  } catch (err) {
    console.error("[turn] failed", err);
    if (live()) {
      if (sentences.length === 0) sendSentence(lines.technical);
      emit({ type: "error", code: "internal", message: "Something went wrong" });
    }
    await finish().catch(() => undefined);
  }
}
