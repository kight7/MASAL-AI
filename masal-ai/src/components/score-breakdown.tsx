import type { ScoreBreakdown as Breakdown } from "@/lib/ai/schemas";
import type { Tier } from "@/lib/types";
import { TIER_META } from "@/components/tier-badge";

const ROWS: { key: keyof Breakdown; label: string }[] = [
  { key: "budget_fit", label: "Budget fit" },
  { key: "timeline_urgency", label: "Timeline urgency" },
  { key: "requirement_clarity", label: "Requirement clarity" },
  { key: "engagement_level", label: "Engagement" },
];

/**
 * The four sub-scores the AI gave (each out of 25). The app adds them up to get the score,
 * so this is exactly why the lead ranks where it does.
 */
export function ScoreBreakdown({ breakdown, tier, reason }: { breakdown: Breakdown; tier: Tier; reason: string }) {
  const color = TIER_META[tier].color;
  return (
    <div>
      <dl className="grid gap-2.5">
        {ROWS.map(({ key, label }) => {
          const value = breakdown[key];
          return (
            <div key={key} className="grid grid-cols-[9.5rem_1fr_2.75rem] items-center gap-3 text-sm max-sm:grid-cols-[7.5rem_1fr_2.75rem]">
              <dt className="text-[#34445A]">{label}</dt>
              <dd className="h-2 overflow-hidden rounded-full bg-[#E3E8EF]" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${(value / 25) * 100}%`, backgroundColor: color }} />
              </dd>
              <dd className="text-right font-semibold tabular-nums text-[#14213D]">
                {value}
                <span className="font-normal text-[#8A96A6]">/25</span>
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-3 text-sm text-[#5B6B80]">{reason}</p>
    </div>
  );
}
