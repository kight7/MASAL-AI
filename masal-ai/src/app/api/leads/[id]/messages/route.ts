import { getLead, json, jsonError, readId, serverError } from "@/lib/api";
import { getServerSupabase } from "@/lib/supabase/server";
import type { LeadMessage } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/leads/[id]/messages -> LeadMessage[] (oldest first). */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const id = await readId(params);
    if (!id) return jsonError(404, "Lead not found");
    if (!(await getLead(id))) return jsonError(404, "Lead not found");

    const { data, error } = await getServerSupabase()
      .from("lead_messages")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return json((data ?? []) as LeadMessage[]);
  } catch (err) {
    return serverError(err);
  }
}
