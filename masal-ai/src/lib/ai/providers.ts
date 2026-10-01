import type { JSONValue, LanguageModel } from "ai";
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
 * Models in the order they should be tried. Used by the streaming chat route, which
 * needs its own fallback logic because stream errors arrive inside the stream.
 */
export function getChatModels(): ModelHandle[] {
  return isForceFallback() ? [getFallbackModel()] : [getPrimaryModel(), getFallbackModel()];
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
