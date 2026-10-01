import { getLead, isDeleteEnabled, json, jsonError, readId, serverError } from "@/lib/api";
import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/leads/[id] -> Lead */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const id = await readId(params);
    if (!id) return jsonError(404, "Lead not found");
    const lead = await getLead(id);
    if (!lead) return jsonError(404, "Lead not found");
    return json(lead);
  } catch (err) {
    return serverError(err);
  }
}

/** DELETE /api/leads/[id] -> { ok: true }. Disabled (403) unless ENABLE_DELETE=true (rule R12). */
export async function DELETE(_req: Request, { params }: Ctx) {
  if (!isDeleteEnabled()) return jsonError(403, "Deleting is disabled on this demo");
  try {
    const id = await readId(params);
    if (!id) return jsonError(404, "Lead not found");
    // lead_messages rows are removed by the "on delete cascade" foreign key.
    const { data, error } = await getServerSupabase().from("leads").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) return jsonError(404, "Lead not found");
    return json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
