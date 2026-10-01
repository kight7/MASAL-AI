"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { announceLead, LEAD_UPDATED_EVENT } from "@/hooks/use-leads";
import type { Lead } from "@/lib/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GAP_MS = 1200; // pause between analyses (free-tier rate limits)
const RETRY_WAIT_MS = 5000; // wait before the single retry after a 429 or provider failure

// Shared across every instance of the button (header + empty state), so two clicks never run two batches.
let batchRunning = false;

type Outcome = "analyzed" | "failed" | "skipped";

/** Analyses one queued lead. Retries once after a short wait on 429 or a provider failure; skips on 409. */
async function analyzeOne(lead: Lead): Promise<Outcome> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`/api/leads/${lead.id}/reanalyze`, { method: "POST" });
      if (res.status === 409) return "skipped"; // someone else is already analysing it
      const body = await res.json().catch(() => null);
      if (res.ok && body) {
        announceLead(body as Lead, LEAD_UPDATED_EVENT);
        if ((body as Lead).status === "analyzed") return "analyzed";
      }
      // 429, 5xx, or both providers failed: wait and try once more.
    } catch {
      // network error: same treatment
    }
    if (attempt === 0) await sleep(RETRY_WAIT_MS);
  }
  return "failed";
}

/**
 * Adds 6 sample leads, then analyses them ONE AT A TIME (never in parallel) with visible
 * progress, so a demo never trips the free-tier rate limits.
 */
export function SampleLeadsButton({ compact = false }: { compact?: boolean }) {
  const [running, setRunning] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  async function run() {
    if (batchRunning) return;
    batchRunning = true;
    setRunning(true);
    const toastId = toast.loading("Adding 6 sample leads…");

    try {
      const res = await fetch("/api/leads/seed", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (res.status === 429) {
        toast.error("Demo limit reached, please try again later.", { id: toastId });
        return;
      }
      if (!res.ok || !Array.isArray(body)) {
        toast.error(body?.error ?? "Sample leads could not be added. Please try again.", { id: toastId });
        return;
      }

      const leads = body as Lead[];
      if (pathname !== "/") router.push("/");
      leads.forEach((l) => announceLead(l, LEAD_UPDATED_EVENT));

      let analyzed = 0;
      for (let i = 0; i < leads.length; i++) {
        toast.loading(`Analyzing ${i + 1} of ${leads.length}: ${leads[i].name}…`, { id: toastId });
        const outcome = await analyzeOne(leads[i]);
        if (outcome === "analyzed") analyzed++;
        if (i < leads.length - 1) await sleep(GAP_MS);
      }

      if (analyzed === leads.length) {
        toast.success(`${analyzed} sample leads added and ranked.`, { id: toastId });
      } else {
        toast.warning(`${analyzed} of ${leads.length} analysed. Use Retry on the others in a minute.`, { id: toastId });
      }
    } catch {
      toast.error("Network error. Check your connection and try again.", { id: toastId });
    } finally {
      batchRunning = false;
      setRunning(false);
    }
  }

  return (
    <Button
      variant="outline"
      onClick={run}
      disabled={running}
      aria-label={compact ? "Load sample leads" : undefined}
      className={compact ? "h-10 px-3 sm:h-8" : "h-10"}
    >
      <Sparkles className="size-4" aria-hidden />
      <span className={compact ? "hidden sm:inline" : undefined}>{running ? "Loading samples…" : "Load sample leads"}</span>
    </Button>
  );
}
