"use client";

import { useEffect, useState } from "react";
import { Inbox, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NewLeadButton } from "@/components/intake-dialog";
import { SampleLeadsButton } from "@/components/sample-leads-button";
import { LeadList } from "@/components/lead-list";
import { StatsBar, type LeadFilter } from "@/components/stats-bar";
import { LEAD_CREATED_EVENT, useLeads } from "@/hooks/use-leads";
import type { Lead } from "@/lib/types";

export default function DashboardPage() {
  const { leads, loading, error, refresh, addLead } = useLeads();
  const [filter, setFilter] = useState<LeadFilter>("all");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Highlight a newly created lead for a few seconds and scroll it into view.
  useEffect(() => {
    const onCreated = (e: Event) => {
      const lead = (e as CustomEvent<Lead>).detail;
      setFilter("all");
      setHighlightId(lead.id);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() =>
        document
          .getElementById(`lead-${lead.id}`)
          ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" })
      );
    };
    window.addEventListener(LEAD_CREATED_EVENT, onCreated);
    return () => window.removeEventListener(LEAD_CREATED_EVENT, onCreated);
  }, []);

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(t);
  }, [highlightId]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <div className="max-w-4xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#14213D]">Your leads</h1>
        <p className="mt-1 text-sm text-[#5B6B80]">Ranked by AI score, hottest first. Open a lead for the full brief and a coach.</p>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading leads">
          <Skeleton className="h-[52px] w-full" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border bg-white px-4 py-8 text-center">
          <p className="text-sm text-[#14213D]">Leads could not be loaded: {error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refresh()}>
            <RotateCw className="size-3.5" aria-hidden />
            Try again
          </Button>
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed bg-white px-4 py-14 text-center">
          <Inbox className="size-8 text-[#9FB0C4]" aria-hidden />
          <p className="mt-3 max-w-sm text-sm text-[#2D3B4E]">
            No leads yet. Add an inquiry and the AI will score it, rank it and suggest what to do next.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <NewLeadButton />
            <SampleLeadsButton />
          </div>
          <p className="mt-3 text-xs text-[#8A96A6]">Sample leads are fictional and take about 30 seconds to analyse.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <StatsBar leads={leads} filter={filter} onFilterChange={setFilter} />
          <LeadList leads={leads} filter={filter} highlightId={highlightId} onUpdated={addLead} />
        </div>
      )}
      </div>
    </div>
  );
}
