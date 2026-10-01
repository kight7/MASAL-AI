"use client";

import { useMemo, useState } from "react";
import { Building2, LoaderCircle, PackageX, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { formatInr, INVENTORY, matchProperties, type MatchLabel, type MatchResult } from "@/lib/matching";
import type { StoredMatchExplanation } from "@/lib/ai/schemas";
import type { Lead } from "@/lib/types";

const LABELS: Record<MatchLabel, { text: string; bg: string; fg: string }> = {
  best_fit: { text: "Best fit", bg: "#E6F4EC", fg: "#1F6B45" },
  stretch: { text: "Stretch", bg: "#FFF4DC", fg: "#875400" },
  alternative: { text: "Alternative", bg: "#EAF0F6", fg: "#34506B" },
};

const STATUS_TEXT = { available: "Available", few_left: "Few left", sold_out: "Sold out" } as const;

function talkingPointsText(matches: MatchResult[], e: StoredMatchExplanation): string {
  const lines = [e.pitch_order, ""];
  for (const m of matches) {
    const p = e.per_property.find((x) => x.property_id === m.property.id);
    lines.push(`${m.property.id} ${m.property.project}, ${m.property.locality} (${formatInr(m.property.price_inr)})`);
    p?.why_it_fits.forEach((w) => lines.push(`- ${w}`));
    if (p && p.watch_out.toLowerCase() !== "none") lines.push(`- Watch out: ${p.watch_out}`);
    lines.push("");
  }
  lines.push(`If they say no: ${e.if_rejected}`);
  return lines.join("\n");
}

/**
 * Property Match & Cross-Sell Matrix.
 * Matches and confidence come from code (src/lib/matching.ts), recomputed whenever the lead
 * changes. "Explain & compare" asks the AI for talking points about exactly these properties.
 */
export function PropertyMatches({ lead, onLeadChange }: { lead: Lead; onLeadChange: (lead: Lead) => void }) {
  const [explaining, setExplaining] = useState(false);
  const { matches, soldOutTopPick } = useMemo(() => matchProperties(lead), [lead]);

  const explanation = lead.match_explanation;
  const ids = matches.map((m) => m.property.id);
  const stale = !!explanation && explanation.property_ids.join(",") !== ids.join(",");
  const current = explanation && !stale ? explanation : null;

  async function explain() {
    setExplaining(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/matches`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Could not explain the matches. Please try again.");
        return;
      }
      // The route returns the view; fetch the fresh lead row so every panel stays in sync.
      const leadRes = await fetch(`/api/leads/${lead.id}`, { cache: "no-store" });
      if (leadRes.ok) onLeadChange((await leadRes.json()) as Lead);
    } catch {
      toast.error("Network error. Check your connection and try again.");
    } finally {
      setExplaining(false);
    }
  }

  return (
    <section className="rounded-lg border bg-white p-4" aria-labelledby="matches-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="matches-title" className="flex items-center gap-2 text-sm font-semibold text-[#14213D]">
          <Building2 className="size-4" aria-hidden />
          Property matches
        </h2>
        {matches.length > 0 && (
          <div className="flex gap-2">
            {current && <CopyButton text={talkingPointsText(matches, current)} label="Copy talking points" />}
            <Button
              variant="outline"
              size="sm"
              onClick={explain}
              disabled={explaining}
              className="h-10 sm:h-8"
            >
              {explaining ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              ) : current ? (
                <RefreshCw className="size-3.5" aria-hidden />
              ) : (
                <Sparkles className="size-3.5" aria-hidden />
              )}
              {explaining ? "Comparing…" : current ? "Refresh" : stale ? "Update comparison" : "Explain & compare"}
            </Button>
          </div>
        )}
      </div>

      {soldOutTopPick && (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-[#FDF3F5] px-3 py-2 text-sm text-[#14213D]">
          <PackageX className="mt-0.5 size-4 shrink-0 text-[#C8233C]" aria-hidden />
          <span>
            Best exact match <strong>{soldOutTopPick.property.project}, {soldOutTopPick.property.title}</strong> (
            {formatInr(soldOutTopPick.property.price_inr)}) is sold out. Pitch these instead.
          </span>
        </p>
      )}

      {current && (
        <p className="mt-3 rounded-md bg-[#14213D] px-3 py-2 text-sm font-medium text-white">{current.pitch_order}</p>
      )}

      {matches.length === 0 ? (
        <p className="mt-3 text-sm text-[#5B6B80]">
          No strong match in the inventory. Ask about budget or location flexibility on the call.
        </p>
      ) : (
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          {matches.map((m, i) => {
            const label = LABELS[m.label];
            const ai = current?.per_property.find((p) => p.property_id === m.property.id);
            const p = m.property;
            return (
              <li key={p.id} className="flex flex-col rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded px-1.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: label.bg, color: label.fg }}>
                    {i + 1}. {label.text}
                  </span>
                  <span className="text-xs text-[#8A96A6]">{p.id}</span>
                </div>

                <div className="mt-2" aria-label={`Match confidence ${m.confidence} out of 100`}>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold tabular-nums text-[#14213D]">{m.confidence}</span>
                    <span className="text-xs text-[#8A96A6]">% match</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E3E8EF]" aria-hidden>
                    <div className="h-full rounded-full bg-[#14213D]" style={{ width: `${m.confidence}%` }} />
                  </div>
                </div>

                <p className="mt-2 text-sm font-semibold leading-snug text-[#14213D]">{p.project}</p>
                <p className="text-xs text-[#5B6B80]">{p.title}</p>

                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                  <dt className="text-[#8A96A6]">Price</dt>
                  <dd className="font-semibold text-[#14213D]">{formatInr(p.price_inr)}</dd>
                  <dt className="text-[#8A96A6]">Size</dt>
                  <dd className="text-[#14213D]">
                    {p.bhk ? `${p.bhk}BHK, ` : ""}
                    {p.carpet_sqft} sq ft
                  </dd>
                  <dt className="text-[#8A96A6]">Where</dt>
                  <dd className="text-[#14213D]">
                    {p.locality}, {p.city}
                  </dd>
                  <dt className="text-[#8A96A6]">Status</dt>
                  <dd className="text-[#14213D]">
                    {STATUS_TEXT[p.status]}, {p.possession === "ready" ? "ready to move" : `possession ${p.possession}`}
                  </dd>
                </dl>

                <ul className="mt-2 space-y-0.5 border-t pt-2 text-xs text-[#34445A]">
                  {m.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>

                {ai && (
                  <div className="mt-2 space-y-1 rounded-md bg-[#F3F5F8] p-2 text-xs">
                    {ai.why_it_fits.map((w) => (
                      <p key={w} className="text-[#14213D]">
                        + {w}
                      </p>
                    ))}
                    {ai.watch_out.toLowerCase() !== "none" && <p className="text-[#875400]">Watch out: {ai.watch_out}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {current && (
        <p className="mt-3 rounded-md border border-[#D5DDE6] px-3 py-2 text-sm text-[#14213D]">
          <span className="font-semibold">If they say no: </span>
          {current.if_rejected}
        </p>
      )}

      <p className="mt-3 text-[11px] text-[#8A96A6]">
        Mock inventory: {INVENTORY.length} fictional properties. The app picks and scores matches; the AI only explains them.
      </p>
    </section>
  );
}
