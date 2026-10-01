import { generateText, Output } from "ai";
import { z } from "zod";
import { CALL_PREP_SYSTEM, buildCallPrepPrompt } from "@/lib/ai/prompts";
import { AIUnavailableError, runWithFallback } from "@/lib/ai/providers";
import { CallPrepSchema, normalizeCallPrep, type StoredCallPrep } from "@/lib/ai/schemas";
import { getLead, json, jsonError, nowIso, parseBody, readId, serverError } from "@/lib/api";
import { matchProperties } from "@/lib/matching";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Lead, LeadMessage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60; // rule R10

type Ctx = { params: Promise<{ id: string }> };

const COOLDOWN_MS = 60_000;
const NOTES_LIMIT = 10;

const view = (lead: Lead) => ({
  callPrep: lead.call_prep,
  asked: lead.call_prep?.asked ?? [],
  preparedAt: lead.call_prep_at,
});

/** GET -> the saved call prep (or null) and which questions are ticked. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const id = await readId(params);
    if (!id) return jsonError(404, "Lead not found");
    const lead = await getLead(id);
    if (!lead) return jsonError(404, "Lead not found");
    return json(view(lead));
  } catch (err) {
    return serverError(err);
  }
}

/**
 * POST -> generates a new call brief from the lead, its analysis, the code-picked property
 * matches and the salesperson's last 10 chat messages. 409 if not analysed; 429 within 60 s.
 */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const id = await readId(params);
    if (!id) return jsonError(404, "Lead not found");
    const lead = await getLead(id);
    if (!lead) return jsonError(404, "Lead not found");
    if (lead.status !== "analyzed") return jsonError(409, "Analyse the lead first, then prepare the call");
    if (lead.call_prep_at && Date.now() - Date.parse(lead.call_prep_at) < COOLDOWN_MS) {
      return jsonError(429, "Just prepared. Please wait a minute before regenerating.");
    }

    const supabase = getServerSupabase();
    const { data: recent, error: chatError } = await supabase
      .from("lead_messages")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(NOTES_LIMIT);
    if (chatError) throw chatError;
    const notes = ((recent ?? []) as LeadMessage[]).reverse();

    const set = matchProperties(lead);
    const allowedIds = set.matches.map((m) => m.property.id);

    let stored: StoredCallPrep;
    try {
      const { result, provider } = await runWithFallback(async ({ model, providerOptions, signal }) => {
        const { output } = await generateText({
          model,
          instructions: CALL_PREP_SYSTEM,
          prompt: buildCallPrepPrompt(lead, set, notes),
          output: Output.object({ schema: CallPrepSchema, name: "call_prep" }),
          providerOptions,
          abortSignal: signal,
          maxRetries: 0,
        });
        return normalizeCallPrep(CallPrepSchema.parse(output), allowedIds);
      });
      stored = { ...result, asked: [], provider };
    } catch (err) {
      if (err instanceof AIUnavailableError) {
        return jsonError(502, "Both AI providers are busy. Please try again in a minute.");
      }
      throw err;
    }

    const { data, error } = await supabase
      .from("leads")
      .update({ call_prep: stored, call_prep_at: nowIso() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return json(view(data as Lead));
  } catch (err) {
    return serverError(err);
  }
}

const AskedSchema = z.object({ asked: z.array(z.number().int().min(0).max(19)).max(20) });

/** PATCH { asked: number[] } -> saves which questions were ticked during the call. No AI call. */
export async function PATCH(req: Request, { params }: Ctx) {
  const parsed = await parseBody(req, AskedSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const id = await readId(params);
    if (!id) return jsonError(404, "Lead not found");
    const lead = await getLead(id);
    if (!lead) return jsonError(404, "Lead not found");
    if (!lead.call_prep) return jsonError(409, "Prepare the call first");

    const count = lead.call_prep.questions.length;
    const asked = [...new Set(parsed.data.asked)].filter((i) => i < count).sort((a, b) => a - b);

    const { data, error } = await getServerSupabase()
      .from("leads")
      .update({ call_prep: { ...lead.call_prep, asked } })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return json(view(data as Lead));
  } catch (err) {
    return serverError(err);
  }
}
