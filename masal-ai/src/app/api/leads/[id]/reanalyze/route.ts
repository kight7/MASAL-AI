import { analyzeAndSave, claimForReanalysis, getLead, json, jsonError, readId, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60; // rule R10

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/leads/[id]/reanalyze -> Lead (pending -> analyzed | failed).
 * 409 if the lead is already being analysed and is not stale (contract section 7).
 */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const id = await readId(params);
    if (!id) return jsonError(404, "Lead not found");

    const claimed = await claimForReanalysis(id);
    if (!claimed) {
      const exists = await getLead(id);
      if (!exists) return jsonError(404, "Lead not found");
      return jsonError(409, "This lead is already being analysed");
    }

    const lead = await analyzeAndSave(claimed);
    return json(lead);
  } catch (err) {
    return serverError(err);
  }
}
