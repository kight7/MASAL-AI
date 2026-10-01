import { generateText, Output } from "ai";
import { runWithFallback } from "@/lib/ai/providers";
import { ANALYSIS_SYSTEM, buildAnalysisPrompt } from "@/lib/ai/prompts";
import {
  AnalysisSchema,
  computeScore,
  normalizeAnalysis,
  tierFromScore,
  type Analysis,
  type LeadInput,
  type Tier,
} from "@/lib/ai/schemas";
import type { AIProvider } from "@/lib/types";

export interface AnalyzeResult {
  analysis: Analysis;
  score: number;
  tier: Tier;
  urgent: boolean;
  provider: AIProvider;
}

/**
 * Analyses one lead with structured output.
 * - One call per attempt; a timeout, provider error or schema/validation failure counts as a
 *   failed attempt and runWithFallback moves to Groq. No same-provider retries (rule R10).
 * - Only name, location, property_requirement, budget, timeline and message are sent;
 *   contact never leaves the server (rule R11).
 * - The score and tier are computed here in code from the four sub-scores (contract section 7).
 * Throws AIUnavailableError if both providers fail.
 */
export async function analyzeLead(input: Omit<LeadInput, "contact">): Promise<AnalyzeResult> {
  const prompt = buildAnalysisPrompt({
    name: input.name,
    location: input.location,
    property_requirement: input.property_requirement,
    budget: input.budget,
    timeline: input.timeline,
    message: input.message,
  });

  const { result, provider } = await runWithFallback(async ({ model, providerOptions, signal }) => {
    const { output } = await generateText({
      model,
      instructions: ANALYSIS_SYSTEM,
      prompt,
      output: Output.object({
        schema: AnalysisSchema,
        name: "lead_analysis",
        description: "Structured analysis of one real-estate lead",
      }),
      providerOptions,
      abortSignal: signal,
      maxRetries: 0,
    });
    // Output.object already validates against the schema; parse again so a bad object can
    // never slip through, then enforce list lengths and sub-score ranges in code.
    return normalizeAnalysis(AnalysisSchema.parse(output));
  });

  const score = computeScore(result.score_breakdown);
  return {
    analysis: result,
    score,
    tier: tierFromScore(score),
    urgent: result.urgent,
    provider,
  };
}
