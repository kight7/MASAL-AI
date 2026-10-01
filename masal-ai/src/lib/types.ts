import type { Analysis, Tier, Timeline } from "@/lib/ai/schemas";

export type { Analysis, Tier, Timeline };

export type LeadStatus = "pending" | "analyzed" | "failed";
export type AIProvider = "gemini" | "groq";

/** One row of the leads table (contract section 5). Field names match the database columns. */
export interface Lead {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  location: string;
  property_requirement: string;
  budget: string;
  timeline: Timeline;
  message: string;
  contact: string | null;
  status: LeadStatus;
  analysis: Analysis | null;
  score: number | null;
  tier: Tier | null;
  urgent: boolean;
  ai_provider: AIProvider | null;
  error: string | null;
}

/** One row of the lead_messages table. */
export interface LeadMessage {
  id: string;
  lead_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export const STALE_PENDING_MS = 90_000;

/**
 * True when a lead has been "pending" for more than 90 seconds, for example because
 * the browser tab closed mid-analysis. The UI offers Retry on these (contract section 7).
 */
export function isStalePending(lead: Pick<Lead, "status" | "updated_at">, now: number = Date.now()): boolean {
  if (lead.status !== "pending") return false;
  const updated = Date.parse(lead.updated_at);
  if (Number.isNaN(updated)) return true;
  return now - updated > STALE_PENDING_MS;
}
