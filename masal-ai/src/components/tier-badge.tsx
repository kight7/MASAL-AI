import { AlarmClock, Flame, Snowflake, Sun, type LucideIcon } from "lucide-react";
import type { Tier } from "@/lib/types";

/*
 * Tier colours are the only strong colour in the app, so priority is what the eye finds first.
 * Every coloured element also carries a text label: colour is never the only signal.
 */
export const TIER_META: Record<
  Tier,
  { label: string; color: string; soft: string; text: string; icon: LucideIcon; hint: string }
> = {
  hot: { label: "Hot", color: "#C8233C", soft: "#FCEBEE", text: "#9A1A2E", icon: Flame, hint: "Contact these first" },
  warm: { label: "Warm", color: "#D98A00", soft: "#FFF4DC", text: "#875400", icon: Sun, hint: "Follow up today" },
  cold: { label: "Cold", color: "#4A6A8A", soft: "#EAF0F6", text: "#34506B", icon: Snowflake, hint: "Nurture when you have time" },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const meta = TIER_META[tier];
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: meta.soft, color: meta.text }}
    >
      <Icon className="size-3.5" aria-hidden />
      {meta.label}
    </span>
  );
}

export function UrgentFlag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[#C8233C] px-1.5 py-0.5 text-xs font-semibold text-white">
      <AlarmClock className="size-3.5" aria-hidden />
      Urgent
    </span>
  );
}
