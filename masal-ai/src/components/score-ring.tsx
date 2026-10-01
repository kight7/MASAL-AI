import type { Tier } from "@/lib/types";
import { TIER_META } from "@/components/tier-badge";

/**
 * Score 0-100 drawn as a ring in the tier colour, with the number in the middle.
 * With no score (pending or failed) it shows a dashed grey ring.
 */
export function ScoreRing({
  score,
  tier,
  size = 48,
}: {
  score: number | null;
  tier: Tier | null;
  size?: number;
}) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const hasScore = score !== null && tier !== null;
  const value = hasScore ? Math.max(0, Math.min(100, score)) : 0;
  const color = hasScore ? TIER_META[tier].color : "#B8C2CE";

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={hasScore ? `Score ${value} out of 100` : "Not scored yet"}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#E3E8EF"
          strokeWidth={stroke}
          strokeDasharray={hasScore ? undefined : "3 4"}
        />
        {hasScore && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - value / 100)}
          />
        )}
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[15px] font-bold tabular-nums"
        style={{ color: hasScore ? "#14213D" : "#8A96A6" }}
      >
        {hasScore ? value : "–"}
      </span>
    </div>
  );
}
