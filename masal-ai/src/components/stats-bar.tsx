"use client";

import type { Lead, Tier } from "@/lib/types";
import { TIER_META } from "@/components/tier-badge";

export type LeadFilter = "all" | Tier | "urgent";

/**
 * Counts that double as filters: click Hot to see only hot leads, click it again for all.
 * Built as toggle buttons (aria-pressed) so it works with keyboard and screen readers.
 */
export function StatsBar({
  leads,
  filter,
  onFilterChange,
}: {
  leads: Lead[];
  filter: LeadFilter;
  onFilterChange: (f: LeadFilter) => void;
}) {
  const analyzed = leads.filter((l) => l.status === "analyzed");
  const count = (t: Tier) => analyzed.filter((l) => l.tier === t).length;
  const tiles: { key: LeadFilter; label: string; value: number; color: string }[] = [
    { key: "hot", label: "Hot", value: count("hot"), color: TIER_META.hot.color },
    { key: "warm", label: "Warm", value: count("warm"), color: TIER_META.warm.color },
    { key: "cold", label: "Cold", value: count("cold"), color: TIER_META.cold.color },
    { key: "urgent", label: "Urgent", value: analyzed.filter((l) => l.urgent).length, color: "#C8233C" },
  ];

  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Filter leads">
      {tiles.map((t) => {
        const active = filter === t.key;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={active}
            onClick={() => onFilterChange(active ? "all" : t.key)}
            className={`flex min-h-[52px] flex-col items-start justify-center rounded-lg border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#14213D] ${
              active ? "border-[#14213D] bg-[#14213D] text-white" : "bg-white text-[#14213D] hover:border-[#9FB0C4]"
            }`}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
              {t.label}
            </span>
            <span className="text-xl font-bold tabular-nums leading-tight">{t.value}</span>
          </button>
        );
      })}
    </div>
  );
}
