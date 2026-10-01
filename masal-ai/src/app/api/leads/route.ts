import { LeadInputSchema } from "@/lib/ai/schemas";
import {
  analyzeAndSave,
  json,
  jsonError,
  LIMIT_REACHED_MESSAGE,
  parseBody,
  remainingLeadSlots,
  serverError,
} from "@/lib/api";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60; // rule R10: up to 2 AI attempts x 12 s, plus database writes

/** GET /api/leads -> Lead[] ordered by score desc (nulls last), then newest first. */
export async function GET() {
  try {
    const { data, error } = await getServerSupabase()
      .from("leads")
      .select("*")
      .order("score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return json((data ?? []) as Lead[]);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * POST /api/leads: validate -> usage cap -> insert as "pending" FIRST (a lead is never lost)
 * -> analyse -> update. Returns the lead with HTTP 200 even when the analysis failed, so the
 * UI can show it with a Retry button.
 */
export async function POST(req: Request) {
  const parsed = await parseBody(req, LeadInputSchema);
  if (!parsed.ok) return parsed.response;

  try {
    if ((await remainingLeadSlots()) < 1) return jsonError(429, LIMIT_REACHED_MESSAGE);

    const { contact, ...fields } = parsed.data;
    const { data, error } = await getServerSupabase()
      .from("leads")
      .insert({ ...fields, contact: contact ?? null, status: "pending" })
      .select("*")
      .single();
    if (error) throw error;

    const lead = await analyzeAndSave(data as Lead);
    return json(lead);
  } catch (err) {
    return serverError(err);
  }
}
