import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Lead input (contract section 6)                                     */
/* ------------------------------------------------------------------ */

export const TIMELINES = [
  "immediately",
  "within_1_month",
  "1_3_months",
  "3_6_months",
  "6_plus_months",
  "just_exploring",
] as const;

export type Timeline = (typeof TIMELINES)[number];

/** Human labels for the timeline enum (used by the form, the cards and the AI prompt). */
export const TIMELINE_LABELS: Record<Timeline, string> = {
  immediately: "Immediately",
  within_1_month: "Within 1 month",
  "1_3_months": "1-3 months",
  "3_6_months": "3-6 months",
  "6_plus_months": "6+ months",
  just_exploring: "Just exploring",
};

export const MESSAGE_MAX = 4000;
export const CONTACT_MAX = 100;

const requiredText = (label: string, max: number) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} is too long (max ${max} characters)`);

export const LeadInputSchema = z.object({
  name: requiredText("Name", 120),
  location: requiredText("Location", 200),
  property_requirement: requiredText("Property requirement", 500),
  budget: requiredText("Budget", 120),
  timeline: z.enum(TIMELINES, { error: "Choose a buying timeline" }),
  message: requiredText("Customer message", MESSAGE_MAX),
  // Optional phone or email. Empty string is treated as "not provided".
  contact: z
    .string()
    .trim()
    .max(CONTACT_MAX, `Contact is too long (max ${CONTACT_MAX} characters)`)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type LeadInput = z.infer<typeof LeadInputSchema>;

/* ------------------------------------------------------------------ */
/* AI analysis (contract section 6)                                    */
/* ------------------------------------------------------------------ */

/*
 * Design note: this schema is what the model must return, so it is kept
 * deliberately tolerant on sizes (no max on arrays or string lengths, sub-scores
 * as plain numbers). Small overruns such as 7 bullets or a sub-score of 26 are
 * fixed in code by normalizeAnalysis() instead of failing the whole attempt and
 * burning the fallback. Structural errors (missing fields, wrong enum values,
 * wrong types) still fail validation and trigger the fallback (rule R3).
 */
export const AnalysisSchema = z.object({
  summary: z.string().min(1).describe("Max 2 sentences."),
  intent: z.string().min(1).describe("What the customer really wants, 1 sentence."),
  intent_type: z.enum(["ready_to_buy", "actively_comparing", "exploring", "info_only"]),
  key_requirements: z.array(z.string()).describe("Max 6 items, each <= 12 words."),
  objections: z
    .array(z.string())
    .describe('Max 5 items. Mark concerns the customer did not say out loud with "(implied)".'),
  next_action: z.object({
    action: z.string().min(1).describe("One concrete step."),
    channel: z.enum(["call", "whatsapp", "email", "site_visit"]),
    timeframe: z.string().min(1).describe('For example "within 2 hours".'),
  }),
  suggested_response: z.string().min(1).describe("Ready to send to the customer, <= 90 words."),
  score_breakdown: z.object({
    budget_fit: z.number().describe("Integer 0-25."),
    timeline_urgency: z.number().describe("Integer 0-25."),
    requirement_clarity: z.number().describe("Integer 0-25."),
    engagement_level: z.number().describe("Integer 0-25."),
  }),
  score_reason: z.string().min(1).describe("1 sentence."),
  urgent: z.boolean(),
});

export type Analysis = z.infer<typeof AnalysisSchema>;
export type ScoreBreakdown = Analysis["score_breakdown"];
export type Channel = Analysis["next_action"]["channel"];
export type IntentType = Analysis["intent_type"];

const clampSubScore = (n: number) => Math.min(25, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));

/** Enforces the contract limits in code: list lengths and sub-score range. */
export function normalizeAnalysis(a: Analysis): Analysis {
  const clean = (items: string[], max: number) =>
    items.map((s) => s.trim()).filter(Boolean).slice(0, max);
  return {
    ...a,
    key_requirements: clean(a.key_requirements, 6),
    objections: clean(a.objections, 5),
    score_breakdown: {
      budget_fit: clampSubScore(a.score_breakdown.budget_fit),
      timeline_urgency: clampSubScore(a.score_breakdown.timeline_urgency),
      requirement_clarity: clampSubScore(a.score_breakdown.requirement_clarity),
      engagement_level: clampSubScore(a.score_breakdown.engagement_level),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Scoring (contract section 7) - computed in code, never by the model */
/* ------------------------------------------------------------------ */

export type Tier = "hot" | "warm" | "cold";

export function computeScore(b: ScoreBreakdown): number {
  return (
    clampSubScore(b.budget_fit) +
    clampSubScore(b.timeline_urgency) +
    clampSubScore(b.requirement_clarity) +
    clampSubScore(b.engagement_level)
  );
}

export function tierFromScore(score: number): Tier {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}
