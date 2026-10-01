"use client";

import { useEffect, useState } from "react";
import { LeadCard } from "@/components/lead-card";
import type { LeadFilter } from "@/components/stats-bar";
import { TIER_META } from "@/components/tier-badge";
import type { Lead, Tier } from "@/lib/types";

/** Contract section 7: inside a tier section, urgent first, then score desc, then newest first. */
export function compareLeads(a: Lead, b: Lead): number {
  if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
  const s = (b.score ?? -1) - (a.score ?? -1);
  if (s !== 0) return s;
  return Date.parse(b.created_at) - Date.parse(a.created_at);
}

const newestFirst = (a: Lead, b: Lead) => Date.parse(b.created_at) - Date.parse(a.created_at);

/** Re-renders every 15 s so "pending" leads turn into "stale" (Retry) without a reload. */
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

type Section = { key: string; title: string; hint: string; color?: string; leads: Lead[] };

export function LeadList({
  leads,
  filter,
  highlightId,
  onUpdated,
}: {
  leads: Lead[];
  filter: LeadFilter;
  highlightId: string | null;
  onUpdated: (lead: Lead) => void;
}) {
  const now = useNow(15_000);

  const analyzed = leads.filter((l) => l.status === "analyzed" && l.tier);
  const attention = leads.filter((l) => l.status !== "analyzed").sort(newestFirst);
  const tierSection = (t: Tier): Section => ({
    key: t,
    title: TIER_META[t].label,
    hint: TIER_META[t].hint,
    color: TIER_META[t].color,
    leads: analyzed.filter((l) => l.tier === t).sort(compareLeads),
  });

  let sections: Section[];
  if (filter === "all") {
    sections = [
      { key: "attention", title: "Needs attention", hint: "Being analysed, or the analysis failed", leads: attention },
      tierSection("hot"),
      tierSection("warm"),
      tierSection("cold"),
    ];
  } else if (filter === "urgent") {
    sections = [
      {
        key: "urgent",
        title: "Urgent",
        hint: "Deadline, competing offer, or wants to act within a week",
        color: "#C8233C",
        leads: analyzed.filter((l) => l.urgent).sort(compareLeads),
      },
    ];
  } else {
    sections = [tierSection(filter)];
  }

  const visible = sections.filter((s) => s.leads.length > 0);

  if (visible.length === 0) {
    return (
      <p className="rounded-lg border border-dashed bg-white px-4 py-8 text-center text-sm text-[#5B6B80]">
        {filter === "urgent" ? "No urgent leads right now." : `No ${filter} leads right now.`}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {visible.map((section) => (
        <section key={section.key} aria-labelledby={`section-${section.key}`}>
          <div className="mb-2 flex items-baseline gap-2">
            {section.color && (
              <span className="size-2.5 self-center rounded-full" style={{ backgroundColor: section.color }} aria-hidden />
            )}
            <h2 id={`section-${section.key}`} className="text-base font-semibold text-[#14213D]">
              {section.title}
              <span className="ml-1.5 font-normal tabular-nums text-[#5B6B80]">({section.leads.length})</span>
            </h2>
            <p className="hidden text-sm text-[#5B6B80] sm:block">{section.hint}</p>
          </div>
          <ul className="space-y-2">
            {section.leads.map((lead) => (
              <li key={lead.id}>
                <LeadCard lead={lead} now={now} highlighted={lead.id === highlightId} onUpdated={onUpdated} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
