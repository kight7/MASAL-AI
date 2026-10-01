import inventoryData from "@/data/inventory.json";
import type { Lead } from "@/lib/types";

/*
 * Property matching: PURE CODE, no AI and no I/O.
 * The app (not the model) decides which properties fit and how well, so the ranking is
 * consistent, explainable line by line, and can never contain an invented listing.
 * The AI is only asked afterwards to explain and compare the properties chosen here.
 */

export type PropertyStatus = "available" | "few_left" | "sold_out";
export type PropertyType = "apartment" | "villa" | "builder_floor" | "plot";

export interface Property {
  id: string;
  title: string;
  project: string;
  locality: string;
  city: string;
  nearby: string[];
  type: PropertyType;
  bhk: number | null;
  carpet_sqft: number;
  price_inr: number;
  status: PropertyStatus;
  possession: string; // "ready" or a month and year
  amenities: string[];
  highlight: string;
}

/** Mock inventory (fictional). In production this would come from the CRM or a database table. */
export const INVENTORY = inventoryData as unknown as Property[];

export type MatchLabel = "best_fit" | "stretch" | "alternative";

export interface MatchBreakdown {
  budget: number; // 0-40
  location: number; // 0-30
  size: number; // 0-20
  features: number; // 0-10
}

export interface MatchResult {
  property: Property;
  confidence: number; // 0-100 = sum of the breakdown
  breakdown: MatchBreakdown;
  label: MatchLabel;
  reasons: string[]; // factual, written by code
}

export interface MatchSet {
  matches: MatchResult[]; // max 3, confidence >= MIN_CONFIDENCE, never sold out
  soldOutTopPick: MatchResult | null; // set when the best property overall is sold out
}

export const MIN_CONFIDENCE = 40;
export const MAX_MATCHES = 3;

export type MatchableLead = Pick<Lead, "location" | "budget" | "property_requirement"> & {
  analysis?: { key_requirements: string[] } | null;
};

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const trimZeros = (n: number) => n.toFixed(2).replace(/\.?0+$/, "");

/** 14500000 -> "Rs 1.45 Cr", 6800000 -> "Rs 68 L" (Indian units). */
export function formatInr(n: number): string {
  if (n >= 1e7) return `₹${trimZeros(n / 1e7)} Cr`;
  if (n >= 1e5) return `₹${trimZeros(n / 1e5)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

const UNIT: Record<string, number> = {
  cr: 1e7, crore: 1e7, crores: 1e7, crs: 1e7,
  l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, lk: 1e5,
  k: 1e3, thousand: 1e3,
};

/**
 * Reads a free-text budget the way customers write it in India.
 * "1.5 Cr", "1.2-1.5 crore", "90L", "80-95 lakhs", "Rs 1,50,00,000", "1.5cr", "1500000".
 * In a range, a number without a unit takes the unit that follows it ("80-95 lakh").
 * Returns null when there is no usable amount ("not decided", "-").
 */
export function parseBudgetInr(text: string): { min: number | null; max: number } | null {
  const re = /(\d+(?:[.,]\d+)*)\s*(crores?|crs?|lakhs?|lacs?|lk|l|k|thousand)?(?![a-z])/gi;
  const tokens: { value: number; unit: number | null }[] = [];
  for (const m of text.toLowerCase().matchAll(re)) {
    const raw = m[1];
    // Indian grouping "1,50,00,000" uses commas as thousands separators; "1.5" is a decimal.
    const value = Number.parseFloat(raw.includes(",") ? raw.replace(/,/g, "") : raw);
    if (!Number.isFinite(value)) continue;
    tokens.push({ value, unit: m[2] ? UNIT[m[2]] ?? null : null });
  }
  if (tokens.length === 0) return null;

  const amounts: number[] = [];
  tokens.forEach((t, i) => {
    let unit = t.unit;
    if (unit === null) unit = tokens.slice(i + 1).find((n) => n.unit !== null)?.unit ?? null;
    const amount = unit === null ? t.value : t.value * unit;
    if (amount >= 1e5 && amount <= 1e10) amounts.push(amount); // ignore stray small numbers
  });
  if (amounts.length === 0) return null;

  const max = Math.max(...amounts);
  const min = amounts.length > 1 ? Math.min(...amounts) : null;
  return { min, max };
}

/** "3BHK", "3 bhk", "3 bedroom" -> 3. */
export function parseBhk(text: string): number | null {
  const m = text.toLowerCase().match(/(\d)\s*(?:bhk|bed\s*rooms?|bedrooms?|br)\b/);
  return m ? Number(m[1]) : null;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/\bsec(?:tor)?[\s.-]*(\d+)/g, "sector $1") // "sec-62", "sector62" -> "sector 62"
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const contains = (haystack: string, needle: string) =>
  new RegExp(`(^|\\s)${normalize(needle).replace(/\s+/g, "\\s+")}(\\s|$)`).test(haystack);

/** Cities mentioned in a location. "Greater Noida West" must not count as Noida. */
function detectCities(text: string): Set<string> {
  const found = new Set<string>();
  let t = text;
  if (/greater noida|noida extension|noida extn/.test(t)) {
    found.add("greater noida");
    t = t.replace(/greater noida( west)?|noida extension|noida extn/g, " ");
  }
  if (/\bnoida\b/.test(t)) found.add("noida");
  if (/gurugram|gurgaon/.test(t)) found.add("gurugram");
  if (/\bdelhi\b/.test(t)) found.add("delhi");
  return found;
}

/** Amenity tags in the inventory and the words a customer might use for them. */
const AMENITY_WORDS: Record<string, string[]> = {
  metro: ["metro"],
  parking: ["parking", "car park"],
  clubhouse: ["clubhouse", "club house"],
  gated: ["gated"],
  school: ["school", "schools"],
  pool: ["pool", "swimming"],
  gym: ["gym"],
  lift: ["lift", "elevator"],
  "high floor": ["high floor", "higher floor", "top floor"],
  "ground floor": ["ground floor"],
  "first floor": ["first floor", "1st floor"],
  "power backup": ["power backup", "backup"],
  park: ["park", "green", "greenery"],
  "ready to move": ["ready to move", "ready possession", "rtm", "immediate possession"],
};

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

function scoreProperty(lead: MatchableLead, p: Property): MatchResult {
  const reasons: string[] = [];
  const budget = parseBudgetInr(lead.budget);
  const location = normalize(lead.location);
  const cities = detectCities(location);
  const cityOk = (city: string) => cities.size === 0 || cities.has(city.toLowerCase());
  const wantedBhk = parseBhk(`${lead.property_requirement} ${lead.analysis?.key_requirements.join(" ") ?? ""}`);
  const featureText = normalize(
    `${lead.property_requirement} ${lead.analysis?.key_requirements.join(" ") ?? ""}`
  );

  // Budget 0-40
  let b: number;
  let overBudget = false;
  if (!budget) {
    b = 20;
    reasons.push("Budget unclear - confirm on call");
  } else if (p.price_inr <= budget.max) {
    b = 40;
    reasons.push(`${formatInr(p.price_inr)}, within budget`);
  } else {
    overBudget = true;
    const over = (p.price_inr - budget.max) / budget.max;
    b = over <= 0.1 ? 25 : over <= 0.2 ? 10 : 0;
    reasons.push(`${formatInr(p.price_inr)}, ${Math.round(over * 100)}% over budget`);
  }

  // Location 0-30
  let l = 0;
  if (contains(location, p.locality) && cityOk(p.city)) {
    l = 30;
    reasons.push(`In ${p.locality}, as asked`);
  } else {
    const near = p.nearby.find((n) => contains(location, n));
    if (near && cityOk(p.city)) {
      l = 15;
      reasons.push(`${p.locality}, next to ${near}`);
    } else if (cities.has(p.city.toLowerCase())) {
      l = 8;
      reasons.push(`Same city (${p.city}), different area`);
    }
  }

  // Size 0-20
  let s: number;
  if (wantedBhk === null || p.bhk === null) {
    s = 10;
  } else if (wantedBhk === p.bhk) {
    s = 20;
    reasons.push(`${p.bhk}BHK, as asked`);
  } else if (Math.abs(wantedBhk - p.bhk) === 1) {
    s = 8;
    reasons.push(`${p.bhk}BHK (asked for ${wantedBhk}BHK)`);
  } else {
    s = 0;
  }

  // Features 0-10: amenities (and ready possession) the customer asked for
  const tags = [...p.amenities, ...(p.possession === "ready" ? ["ready to move"] : [])];
  const hits = tags.filter((tag) => (AMENITY_WORDS[tag] ?? [tag]).some((w) => contains(featureText, w)));
  const f = Math.min(10, hits.length * 3);
  if (hits.length) reasons.push(`Has ${hits.slice(0, 3).join(", ")}`);
  const wantsReady = AMENITY_WORDS["ready to move"].some((w) => contains(featureText, w));
  if (wantsReady && p.possession !== "ready") reasons.push(`Possession ${p.possession}, not ready to move`);

  const label: MatchLabel = overBudget ? "stretch" : l < 30 ? "alternative" : "best_fit";
  return {
    property: p,
    confidence: b + l + s + f,
    breakdown: { budget: b, location: l, size: s, features: f },
    label,
    reasons: reasons.slice(0, 5),
  };
}

const byConfidenceThenPrice = (a: MatchResult, b: MatchResult) =>
  b.confidence - a.confidence || a.property.price_inr - b.property.price_inr;

/**
 * Top properties for a lead. Sold-out properties never appear in `matches`, but if the best
 * property overall is sold out it is returned as `soldOutTopPick`, so the UI can say
 * "the exact match is sold out - pitch these instead" (the cross-sell).
 */
export function matchProperties(lead: MatchableLead, inventory: Property[] = INVENTORY): MatchSet {
  const all = inventory.map((p) => scoreProperty(lead, p)).sort(byConfidenceThenPrice);
  const top = all[0];
  const soldOutTopPick = top && top.property.status === "sold_out" && top.confidence >= MIN_CONFIDENCE ? top : null;
  const matches = all
    .filter((m) => m.property.status !== "sold_out" && m.confidence >= MIN_CONFIDENCE)
    .slice(0, MAX_MATCHES);
  return { matches, soldOutTopPick };
}
