"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircle, Mail, MapPin, MessageCircle, Phone, RotateCw, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/score-ring";
import { TierBadge, TIER_META, UrgentFlag } from "@/components/tier-badge";
import { TIMELINE_LABELS, type Channel } from "@/lib/ai/schemas";
import { isStalePending, type Lead } from "@/lib/types";

export const CHANNEL_META: Record<Channel, { label: string; icon: LucideIcon }> = {
  call: { label: "Call", icon: Phone },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  email: { label: "Email", icon: Mail },
  site_visit: { label: "Site visit", icon: MapPin },
};

/**
 * One lead, scannable in about 2 seconds: score, who and where, tier, urgency, the AI summary,
 * then budget, timeline and the next action. The whole card links to the lead's detail page.
 */
export function LeadCard({
  lead,
  now,
  highlighted,
  onUpdated,
}: {
  lead: Lead;
  now: number;
  highlighted?: boolean;
  onUpdated: (lead: Lead) => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const stale = isStalePending(lead, now);
  const pending = lead.status === "pending" && !stale && !retrying;
  const needsRetry = !retrying && (lead.status === "failed" || stale);

  async function retry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/reanalyze`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast.info("This lead is already being analysed.");
      } else if (!res.ok) {
        toast.error(body?.error ?? "Retry failed. Please try again.");
      } else {
        onUpdated(body as Lead);
        if ((body as Lead).status === "failed") toast.error("Both AI providers are still busy. Try again in a minute.");
      }
    } catch {
      toast.error("Network error. Check your connection and try again.");
    } finally {
      setRetrying(false);
    }
  }

  const tierColor = lead.tier && lead.status === "analyzed" ? TIER_META[lead.tier].color : "#CBD3DD";
  const analysis = lead.status === "analyzed" ? lead.analysis : null;
  const channel = analysis ? CHANNEL_META[analysis.next_action.channel] : null;
  const ChannelIcon = channel?.icon;

  return (
    <article
      id={`lead-${lead.id}`}
      className={`group relative flex gap-3 rounded-lg border bg-white p-3 transition-colors hover:border-[#9FB0C4] hover:bg-[#FBFCFD] sm:gap-4 sm:p-4 ${
        highlighted ? "ring-2 ring-[#14213D] ring-offset-2" : ""
      } ${needsRetry ? "bg-[#FAFBFC]" : ""}`}
      style={{ borderLeftWidth: 4, borderLeftColor: tierColor }}
    >
      <ScoreRing score={analysis ? lead.score : null} tier={analysis ? lead.tier : null} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="min-w-0 truncate text-[15px] font-semibold text-[#14213D]">
            {/* Stretched link: the whole card is clickable, while the Retry button stays separate. */}
            <Link
              href={`/leads/${lead.id}`}
              className="outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-[#14213D]"
            >
              {lead.name}
            </Link>
          </h3>
          <span className="truncate text-sm text-[#5B6B80]">{lead.location}</span>
          {analysis && lead.tier && <TierBadge tier={lead.tier} />}
          {analysis && lead.urgent && <UrgentFlag />}
        </div>

        {(pending || retrying) && (
          <div className="mt-2 space-y-2" aria-live="polite">
            <p className="flex items-center gap-1.5 text-sm text-[#5B6B80]">
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              Analyzing…
            </p>
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        )}

        {needsRetry && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-sm text-[#5B6B80]">
              {stale && lead.status === "pending"
                ? "Analysis stopped before finishing."
                : "AI analysis failed. The lead is saved."}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={retry}
              className="relative z-10 h-8"
              aria-label={`Retry analysis for ${lead.name}`}
            >
              <RotateCw className="size-3.5" aria-hidden />
              Retry
            </Button>
          </div>
        )}

        {analysis && (
          <>
            <p className="mt-1 line-clamp-2 text-sm leading-snug text-[#2D3B4E]">{analysis.summary}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="rounded-md bg-[#EEF2F6] px-1.5 py-0.5 font-medium text-[#34445A]">{lead.budget}</span>
              <span className="rounded-md bg-[#EEF2F6] px-1.5 py-0.5 font-medium text-[#34445A]">
                {TIMELINE_LABELS[lead.timeline] ?? lead.timeline}
              </span>
              {channel && ChannelIcon && (
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-[#D5DDE6] px-1.5 py-0.5 text-[#14213D]"
                  title={analysis.next_action.action}
                >
                  <ChannelIcon className="size-3.5" aria-hidden />
                  <span className="font-semibold">{channel.label}</span>
                  <span className="text-[#5B6B80]">{analysis.next_action.timeframe}</span>
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </article>
  );
}
