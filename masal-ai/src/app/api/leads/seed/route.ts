import { json, jsonError, LIMIT_REACHED_MESSAGE, remainingLeadSlots, serverError } from "@/lib/api";
import { SAMPLE_LEADS } from "@/lib/sample-leads";
import { getServerSupabase } from "@/lib/supabase/server";
import { QUEUED_MARKER, type Lead } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/leads/seed -> Lead[] (6 sample leads, status "pending", queued).
 * No AI call here, so it cannot time out: the client then analyses them ONE BY ONE through
 * POST /api/leads/[id]/reanalyze, which respects free-tier rate limits.
 * 429 if fewer than 6 slots remain under MAX_LEADS_PER_HOUR (rule R12).
 */
export async function POST() {
  try {
    if ((await remainingLeadSlots()) < SAMPLE_LEADS.length) return jsonError(429, LIMIT_REACHED_MESSAGE);

    // Stagger created_at by 1 ms so the original order is stable when sorted by time.
    const base = Date.now();
    const rows = SAMPLE_LEADS.map(({ contact, ...fields }, i) => ({
      ...fields,
      contact: contact ?? null,
      status: "pending",
      error: QUEUED_MARKER,
      created_at: new Date(base - i).toISOString(),
      updated_at: new Date(base).toISOString(),
    }));

    const { data, error } = await getServerSupabase().from("leads").insert(rows).select("*");
    if (error) throw error;

    const leads = (data ?? []) as Lead[];
    leads.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return json(leads);
  } catch (err) {
    return serverError(err);
  }
}
