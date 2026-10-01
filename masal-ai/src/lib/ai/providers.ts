import { streamText, type JSONValue, type LanguageModel, type ModelMessage, type UIMessageChunk } from "ai";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import type { AIProvider } from "@/lib/types";

/*
 * Provider layer: Gemini is primary, Groq is the fallback.
 *
 * Time budget (rule R10): every attempt gets AI_ATTEMPT_TIMEOUT_MS and there are at
 * most two attempts per request, so 2 x 12 s = 24 s, well inside the 60 s route limit.
 * Callers MUST also pass maxRetries: 0 to the AI SDK, because its default (2 silent
 * retries per call) would multiply the time spent per attempt.
 *
 * API keys are read by the provider packages from GOOGLE_GENERATIVE_AI_API_KEY and
 * GROQ_API_KEY. Model ids come only from env vars (rule R5). Server-only module.
 */

export const AI_ATTEMPT_TIMEOUT_MS = 12_000;

/** Shape of the AI SDK providerOptions setting: { providerName: { option: value } }. */
export type ProviderOptions = Record<string, Record<string, JSONValue>>;

export interface ModelHandle {
  provider: AIProvider;
  modelId: string;
  model: LanguageModel;
  /** Provider-specific settings tuned for speed (low reasoning effort). */
  providerOptions: ProviderOptions;
}

export interface AttemptContext extends ModelHandle {
  /** Aborts the attempt after AI_ATTEMPT_TIMEOUT_MS. Pass it to the AI SDK as abortSignal. */
  signal: AbortSignal;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set. Add it to .env.local (and to Vercel for production).`);
  return value;
}

export function isForceFallback(): boolean {
  return process.env.FORCE_FALLBACK?.trim().toLowerCase() === "true";
}

export function getPrimaryModel(): ModelHandle {
  const modelId = requireEnv("GEMINI_MODEL");
  // Gemini 3.x models take thinkingLevel; 2.x models take thinkingBudget instead.
  const providerOptions: ProviderOptions = modelId.startsWith("gemini-3")
    ? { google: { thinkingConfig: { thinkingLevel: "low" } } }
    : {};
  return { provider: "gemini", modelId, model: google(modelId), providerOptions };
}

export function getFallbackModel(): ModelHandle {
  const modelId = requireEnv("GROQ_MODEL");
  // structuredOutputs: true sends a JSON schema (supported by the gpt-oss models on Groq).
  // reasoningEffort is only valid for reasoning models such as openai/gpt-oss-*.
  const groqOptions: Record<string, JSONValue> = { structuredOutputs: true };
  if (modelId.startsWith("openai/gpt-oss")) groqOptions.reasoningEffort = "low";
  return { provider: "groq", modelId, model: groq(modelId), providerOptions: { groq: groqOptions } };
}

/**
 * Models in the order they should be tried by the streaming chat route.
 * A model whose env var is missing is skipped (and logged) instead of breaking the chat.
 */
export function getChatModels(): ModelHandle[] {
  const getters = isForceFallback() ? [getFallbackModel] : [getPrimaryModel, getFallbackModel];
  const models: ModelHandle[] = [];
  for (const get of getters) {
    try {
      models.push(get());
    } catch (err) {
      console.warn(`[ai] skipping chat model: ${describeError(err)}`);
    }
  }
  return models;
}

export class AIUnavailableError extends Error {
  constructor(public readonly attempts: { provider: AIProvider; error: string }[]) {
    super(
      "Both AI providers failed. " +
        attempts.map((a) => `${a.provider}: ${a.error}`).join(" | ")
    );
    this.name = "AIUnavailableError";
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return `timed out after ${AI_ATTEMPT_TIMEOUT_MS / 1000}s`;
    }
    return err.message.slice(0, 300);
  }
  return String(err).slice(0, 300);
}

/**
 * Runs fn with the primary model; on ANY error (429, 5xx, timeout, missing key,
 * schema or validation failure) runs it exactly once with the fallback model.
 * Throws AIUnavailableError only when both attempts fail.
 */
export async function runWithFallback<T>(
  fn: (ctx: AttemptContext) => Promise<T>
): Promise<{ result: T; provider: AIProvider }> {
  const attempts: { provider: AIProvider; error: string }[] = [];
  const getters = isForceFallback() ? [getFallbackModel] : [getPrimaryModel, getFallbackModel];

  for (const getModel of getters) {
    let provider: AIProvider = getModel === getPrimaryModel ? "gemini" : "groq";
    try {
      const handle = getModel(); // may throw if the model env var is missing -> counts as a failed attempt
      provider = handle.provider;
      const signal = AbortSignal.timeout(AI_ATTEMPT_TIMEOUT_MS);
      const result = await fn({ ...handle, signal });
      return { result, provider };
    } catch (err) {
      const message = describeError(err);
      attempts.push({ provider, error: message });
      console.warn(`[ai] ${provider} attempt failed: ${message}`);
    }
  }
  throw new AIUnavailableError(attempts);
}

/* ------------------------------------------------------------------ */
/* Streaming chat with fallback                                        */
/* ------------------------------------------------------------------ */

export interface ChatStreamResult {
  /** Full assistant text that reached the client ("" if nothing was produced). */
  text: string;
  /** Provider that produced the text, or null if every attempt failed before the first token. */
  provider: AIProvider | null;
  /** Error description if the reply failed or was cut off, else null. */
  error: string | null;
}

/**
 * Streams one chat reply into a UI message stream, with fallback.
 *
 * Why not a try/catch around streamText? Provider errors such as a 429 usually arrive
 * INSIDE the stream (as an "error" part), not as a thrown error. So each model's stream is
 * read part by part:
 *  - error, abort or timeout BEFORE the first text  -> discard this attempt, try the next model;
 *  - error AFTER text has started                   -> never switch providers mid-reply; end the
 *    text and send an error chunk to the client.
 * Each attempt gets AI_ATTEMPT_TIMEOUT_MS to produce its first token (rule R10). After that the
 * reply streams normally until it finishes or the client disconnects (abortSignal).
 */
export async function streamChatWithFallback(opts: {
  models: ModelHandle[];
  instructions: string;
  messages: ModelMessage[];
  writer: { write: (chunk: UIMessageChunk) => void };
  abortSignal?: AbortSignal;
}): Promise<ChatStreamResult> {
  const { models, instructions, messages, writer, abortSignal } = opts;
  const failures: { provider: AIProvider; error: string }[] = [];

  for (const handle of models) {
    if (abortSignal?.aborted) break;

    const firstToken = new AbortController();
    const timer = setTimeout(
      () => firstToken.abort(new DOMException(`no first token after ${AI_ATTEMPT_TIMEOUT_MS / 1000}s`, "TimeoutError")),
      AI_ATTEMPT_TIMEOUT_MS
    );
    const signal = abortSignal ? AbortSignal.any([abortSignal, firstToken.signal]) : firstToken.signal;
    const textId = `text-${handle.provider}`;
    let text = "";
    let started = false;

    try {
      const result = streamText({
        model: handle.model,
        instructions,
        messages,
        providerOptions: handle.providerOptions,
        abortSignal: signal,
        maxRetries: 0,
        onError: () => {}, // errors are handled (and logged once) below
      });

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          if (!part.text) continue;
          if (!started) {
            started = true;
            clearTimeout(timer);
            writer.write({ type: "text-start", id: textId });
          }
          text += part.text;
          writer.write({ type: "text-delta", id: textId, delta: part.text });
        } else if (part.type === "error") {
          throw part.error;
        } else if (part.type === "abort") {
          throw firstToken.signal.aborted
            ? firstToken.signal.reason
            : new Error(part.reason ?? "aborted by the client");
        }
      }

      clearTimeout(timer);
      if (!started) throw new Error("the model returned an empty reply");
      writer.write({ type: "text-end", id: textId });
      console.info(`[ai] chat answered by ${handle.provider}`);
      return { text, provider: handle.provider, error: null };
    } catch (err) {
      clearTimeout(timer);
      const message = firstToken.signal.aborted && !started
        ? `timed out after ${AI_ATTEMPT_TIMEOUT_MS / 1000}s`
        : describeError(err);

      if (started) {
        // Text already reached the client: do not switch providers mid-reply.
        writer.write({ type: "text-end", id: textId });
        if (!abortSignal?.aborted) {
          writer.write({ type: "error", errorText: "The reply was interrupted. Please try again." });
        }
        console.warn(`[ai] ${handle.provider} chat stream broke after text started: ${message}`);
        return { text, provider: handle.provider, error: message };
      }

      failures.push({ provider: handle.provider, error: message });
      console.warn(`[ai] ${handle.provider} chat attempt failed: ${message}`);
    }
  }

  if (!abortSignal?.aborted) {
    writer.write({
      type: "error",
      errorText: "Both AI providers are busy right now. Your message is saved - please try again in a minute.",
    });
  }
  return {
    text: "",
    provider: null,
    error: failures.map((f) => `${f.provider}: ${f.error}`).join(" | ") || "no AI model is configured",
  };
}
