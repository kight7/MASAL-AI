import { generateText, Output } from "ai";
import { MATCH_SYSTEM, buildMatchPrompt } from "@/lib/ai/prompts";
import { runWithFallback } from "@/lib/ai/providers";
import {
  MatchExplanationSchema,
  normalizeMatchExplanation,
  type StoredMatchExplanation,
} from "@/lib/ai/schemas";
import { getLead, json, jsonError, nowIso, readId, serverError } from "@/lib/api";
import { matchProperties, type MatchSet } from "@/lib/matching";
import { getServerSupabase } from "@/lib/supabase/server";
import { AIUnavailableError } from "@/lib/ai/providers";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60; // rule R10

type Ctx = { params: Promise<{ id: string }> };

const EXPLAIN_COOLDOWN_MS = 60_000;

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

function view(lead: Lead, set: MatchSet) {
  const ids = set.matches.map((m) => m.property.id);
  const explanation = lead.match_explanation;
  return {
    matches: set.matches,
    soldOutTopPick: set.soldOutTopPick,
    explanation,
    // The saved talking points cover a different set of properties (lead re-analysed or inventory changed).
    explanationStale: explanation ? !sameIds(explanation.property_ids, ids) : false,
  };
}

/** GET -> matches computed instantly in code, plus any saved AI explanation. No AI call. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const id = await readId(params);
    if (!id) return jsonError(404, "Lead not found");
    const lead = await getLead(id);
    if (!lead) return jsonError(404, "Lead not found");
    return json(view(lead, matchProperties(lead)));
  } catch (err) {
    return serverError(err);
  }
}

/**
 * POST -> asks the AI to explain and compare the code-picked matches, saves and returns them.
 * 409 if the lead is not analysed or has no matches; 429 if explained less than 60 s ago.
 */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const id = await readId(params);
    if (!id) return jsonError(404, "Lead not found");
    const lead = await getLead(id);
    if (!lead) return jsonError(404, "Lead not found");
    if (lead.status !== "analyzed") return jsonError(409, "Analyse the lead first, then explain its matches");

    const set = matchProperties(lead);
    if (set.matches.length === 0) return jsonError(409, "No strong property match to explain");

    if (lead.match_explained_at && Date.now() - Date.parse(lead.match_explained_at) < EXPLAIN_COOLDOWN_MS) {
      return jsonError(429, "Just explained. Please wait a minute before refreshing.");
    }

    const ids = set.matches.map((m) => m.property.id);
    let stored: StoredMatchExplanation;
    try {
      const { result, provider } = await runWithFallback(async ({ model, providerOptions, signal }) => {
        const { output } = await generateText({
          model,
          instructions: MATCH_SYSTEM,
          prompt: buildMatchPrompt(lead, set),
          output: Output.object({ schema: MatchExplanationSchema, name: "match_explanation" }),
          providerOptions,
          abortSignal: signal,
          maxRetries: 0,
        });
        // Validation (including unknown property ids) failing here moves on to the fallback provider.
        return normalizeMatchExplanation(MatchExplanationSchema.parse(output), ids);
      });
      stored = { ...result, property_ids: ids, provider };
    } catch (err) {
      if (err instanceof AIUnavailableError) {
        return jsonError(502, "Both AI providers are busy. Please try again in a minute.");
      }
      throw err;
    }

    const { data, error } = await getServerSupabase()
      .from("leads")
      .update({ match_explanation: stored, match_explained_at: nowIso() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    return json(view(data as Lead, set));
  } catch (err) {
    return serverError(err);
  }
}
