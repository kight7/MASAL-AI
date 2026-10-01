import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeLead } from "@/lib/ai/analyze";
import { AIUnavailableError } from "@/lib/ai/providers";
import type { LeadInput } from "@/lib/ai/schemas";
import { getServerSupabase } from "@/lib/supabase/server";
import { STALE_PENDING_MS, type Lead } from "@/lib/types";

/*
 * Shared helpers for the API routes (contract section 8). Server only.
 */

/* ---------------- Responses ---------------- */

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/** Contract error format: { error: string } plus optional extra fields (fieldErrors for 400). */
export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

/** Last-resort handler for unexpected errors inside a route's try/catch. */
export function serverError(err: unknown) {
  console.error("[api] unexpected error:", err);
  return jsonError(500, "Something went wrong on the server. Please try again.");
}

/* ---------------- Input ---------------- */

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** Reads the JSON body and validates it. On failure returns a ready 400 response with fieldErrors. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<ParseResult<z.infer<S>>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false, response: jsonError(400, "Request body must be valid JSON") };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const { fieldErrors } = z.flattenError(result.error);
    return { ok: false, response: jsonError(400, "Please fix the highlighted fields", { fieldErrors }) };
  }
  return { ok: true, data: result.data };
}

const IdSchema = z.uuid();

/** Route params are a Promise in this Next.js version. Returns null for a malformed id (treated as 404). */
export async function readId(params: Promise<{ id: string }>): Promise<string | null> {
  const { id } = await params;
  return IdSchema.safeParse(id).success ? id : null;
}

/* ---------------- Config and guards (rule R12) ---------------- */

export function maxLeadsPerHour(): number {
  const n = Number.parseInt(process.env.MAX_LEADS_PER_HOUR ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

export function isDeleteEnabled(): boolean {
  return process.env.ENABLE_DELETE?.trim().toLowerCase() === "true";
}

export const MAX_CHAT_MESSAGES_PER_LEAD = 30;

/** How many more leads can be created in the current rolling hour (app-wide). */
export async function remainingLeadSlots(): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await getServerSupabase()
    .from("leads")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (error) throw error;
  return Math.max(0, maxLeadsPerHour() - (count ?? 0));
}

export const LIMIT_REACHED_MESSAGE = "Demo limit reached, please try again later.";

/* ---------------- Leads ---------------- */

export function nowIso(): string {
  return new Date().toISOString();
}

export async function getLead(id: string): Promise<Lead | null> {
  const { data, error } = await getServerSupabase().from("leads").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Lead | null) ?? null;
}

/** The lead fields the analysis needs. Contact is not included (rule R11). */
function toAnalysisInput(lead: Lead): Omit<LeadInput, "contact"> {
  return {
    name: lead.name,
    location: lead.location,
    property_requirement: lead.property_requirement,
    budget: lead.budget,
    timeline: lead.timeline,
    message: lead.message,
  };
}

/**
 * Runs the AI analysis for a lead that is already saved as "pending" and stores the outcome.
 * Never throws for AI failures: the lead is marked "failed" with the error text so the UI can
 * offer Retry. Returns the updated row.
 */
export async function analyzeAndSave(lead: Lead): Promise<Lead> {
  const supabase = getServerSupabase();
  let update: Partial<Lead>;
  try {
    const result = await analyzeLead(toAnalysisInput(lead));
    update = {
      status: "analyzed",
      analysis: result.analysis,
      score: result.score,
      tier: result.tier,
      urgent: result.urgent,
      ai_provider: result.provider,
      error: null,
      updated_at: nowIso(),
    };
  } catch (err) {
    const message =
      err instanceof AIUnavailableError
        ? err.message
        : `Analysis failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[api] analysis failed for lead ${lead.id}: ${message}`);
    update = { status: "failed", error: message.slice(0, 1000), updated_at: nowIso() };
  }

  const { data, error } = await supabase.from("leads").update(update).eq("id", lead.id).select("*").single();
  if (error) throw error;
  return data as Lead;
}

/**
 * Atomically moves a lead to "pending" unless it is already being analysed.
 * Returns the claimed row, or null if the lead is pending and not yet stale (caller returns 409).
 * The condition is part of the UPDATE, so two simultaneous clicks cannot both start an analysis.
 */
export async function claimForReanalysis(id: string): Promise<Lead | null> {
  const staleBefore = new Date(Date.now() - STALE_PENDING_MS).toISOString();
  const { data, error } = await getServerSupabase()
    .from("leads")
    .update({ status: "pending", error: null, updated_at: nowIso() })
    .eq("id", id)
    .or(`status.neq.pending,updated_at.lt."${staleBefore}"`)
    .select("*");
  if (error) throw error;
  return (data?.[0] as Lead | undefined) ?? null;
}
