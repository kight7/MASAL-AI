"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ClipboardList, LoaderCircle, Mail, Phone, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CallPrepPanel, useCallPrep } from "@/components/call-prep-panel";
import { CopyButton } from "@/components/copy-button";
import { PropertyMatches } from "@/components/property-matches";
import { CHANNEL_META } from "@/components/lead-card";
import { ScoreBreakdown } from "@/components/score-breakdown";
import { ScoreRing } from "@/components/score-ring";
import { TierBadge, TIER_META, UrgentFlag } from "@/components/tier-badge";
import { TIMELINE_LABELS, type IntentType } from "@/lib/ai/schemas";
import { isStalePending, type Lead } from "@/lib/types";

const INTENT_LABELS: Record<IntentType, string> = {
  ready_to_buy: "Ready to buy",
  actively_comparing: "Comparing options",
  exploring: "Exploring",
  info_only: "Just asking",
};

function contactHref(contact: string): string {
  if (contact.includes("@")) return `mailto:${contact}`;
  return `tel:${contact.replace(/[^\d+]/g, "")}`;
}

/**
 * The AI brief, in scan order: who and how hot, the next action, what they want,
 * requirements vs concerns, why the score, a reply ready to send, and the original inquiry.
 */
export function AnalysisBrief({
  lead,
  enableDelete,
  onLeadChange,
}: {
  lead: Lead;
  enableDelete: boolean;
  onLeadChange: (lead: Lead) => void;
}) {
  const router = useRouter();
  const [reanalyzing, setReanalyzing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const prepRef = useRef<HTMLElement>(null);
  const callPrep = useCallPrep(lead, onLeadChange);

  /** "Prep for call" in the Next Action box: jump to the panel and generate if there is no brief yet. */
  function prepForCall() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    prepRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    if (!lead.call_prep) void callPrep.generate();
  }

  const analysis = lead.status === "analyzed" ? lead.analysis : null;
  const stale = isStalePending(lead);
  const busy = reanalyzing || (lead.status === "pending" && !stale);

  async function reanalyze() {
    setReanalyzing(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/reanalyze`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) toast.info("This lead is already being analysed.");
      else if (!res.ok) toast.error(body?.error ?? "Re-analysis failed. Please try again.");
      else {
        onLeadChange(body as Lead);
        if ((body as Lead).status === "failed") toast.error("Both AI providers are busy. Your lead is saved, retry in a minute.");
        else toast.success("Analysis updated.");
      }
    } catch {
      toast.error("Network error. Check your connection and try again.");
    } finally {
      setReanalyzing(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Could not delete this lead.");
        return;
      }
      toast.success(`${lead.name} deleted.`);
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Network error. Check your connection and try again.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const channel = analysis ? CHANNEL_META[analysis.next_action.channel] : null;
  const ChannelIcon = channel?.icon;
  const tier = analysis ? lead.tier : null;

  return (
    <div className="space-y-5">
      {/* a. Header */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-md text-sm text-[#5B6B80] outline-none hover:text-[#14213D] focus-visible:ring-2 focus-visible:ring-[#14213D]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All leads
        </Link>

        <div className="mt-3 flex items-start gap-4">
          <ScoreRing score={analysis ? lead.score : null} tier={tier} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[#14213D]">{lead.name}</h1>
              {tier && <TierBadge tier={tier} />}
              {analysis && lead.urgent && <UrgentFlag />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#5B6B80]">
              <span>{lead.location}</span>
              {lead.contact && (
                <a
                  href={contactHref(lead.contact)}
                  className="inline-flex items-center gap-1 font-medium text-[#14213D] underline-offset-2 hover:underline"
                >
                  {lead.contact.includes("@") ? <Mail className="size-3.5" aria-hidden /> : <Phone className="size-3.5" aria-hidden />}
                  {lead.contact}
                </a>
              )}
              {analysis && lead.ai_provider && (
                <span className="text-xs text-[#8A96A6]">
                  Analysed by {lead.ai_provider === "groq" ? "Groq (fallback)" : "Gemini"}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={reanalyze} disabled={busy} className="h-10 sm:h-8">
            {busy ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RotateCw className="size-3.5" aria-hidden />}
            {busy ? "Analysing…" : "Re-analyse"}
          </Button>
          {enableDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="h-10 text-[#C8233C] hover:text-[#9A1A2E] sm:h-8"
            >
              <Trash2 className="size-3.5" aria-hidden />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Pending / failed states */}
      {!analysis && busy && (
        <div className="space-y-3 rounded-lg border bg-white p-4" aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-[#5B6B80]">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Analysing this lead. This usually takes a few seconds.
          </p>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}
      {!analysis && !busy && (
        <div className="flex items-start gap-3 rounded-lg border border-[#F2D3D8] bg-[#FDF3F5] p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#C8233C]" aria-hidden />
          <div>
            <p className="font-medium text-[#14213D]">
              {lead.status === "failed"
                ? "Both AI providers were busy. The lead is saved."
                : "The analysis stopped before finishing."}
            </p>
            <p className="mt-1 text-[#5B6B80]">Use Re-analyse in a minute. The coach chat still works with the lead details.</p>
          </div>
        </div>
      )}

      {analysis && (
        <>
          {/* b. Next action: the most prominent block */}
          {channel && ChannelIcon && (
            <section
              aria-label="Recommended next action"
              className="flex items-start gap-3 rounded-lg p-4 text-white"
              style={{ backgroundColor: "#14213D" }}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white/12">
                <ChannelIcon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/70">
                  Next: {channel.label}, {analysis.next_action.timeframe}
                </p>
                <p className="mt-0.5 text-lg font-semibold leading-snug">{analysis.next_action.action}</p>
                <button
                  type="button"
                  onClick={prepForCall}
                  disabled={callPrep.generating}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-[#14213D] outline-none hover:bg-[#E6EBF1] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#14213D] disabled:opacity-70 sm:min-h-9"
                >
                  {callPrep.generating ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <ClipboardList className="size-4" aria-hidden />
                  )}
                  {callPrep.generating ? "Preparing your call…" : lead.call_prep ? "Open call prep" : "Prep for call"}
                </button>
              </div>
            </section>
          )}

          {/* b1. Call prep notes (Prompt 5.2) */}
          <CallPrepPanel
            ref={prepRef}
            lead={lead}
            onLeadChange={onLeadChange}
            generating={callPrep.generating}
            onGenerate={() => void callPrep.generate()}
          />

          {/* b2. Property Match & Cross-Sell Matrix (Prompt 5.1) */}
          <PropertyMatches lead={lead} onLeadChange={onLeadChange} />

          {/* c. Summary and intent */}
          <section className="rounded-lg border bg-white p-4">
            <p className="text-[15px] leading-relaxed text-[#14213D]">{analysis.summary}</p>
            <div className="mt-3 flex flex-wrap items-baseline gap-2 border-t pt-3">
              <span className="rounded-md bg-[#EEF2F6] px-1.5 py-0.5 text-xs font-semibold text-[#34445A]">
                {INTENT_LABELS[analysis.intent_type]}
              </span>
              <p className="text-sm text-[#34445A]">
                <span className="font-medium text-[#14213D]">Wants: </span>
                {analysis.intent}
              </p>
            </div>
          </section>

          {/* d. Requirements | concerns */}
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold text-[#14213D]">Key requirements</h2>
              {analysis.key_requirements.length ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {analysis.key_requirements.map((r) => (
                    <li key={r} className="rounded-md bg-[#EEF2F6] px-2 py-1 text-xs font-medium text-[#34445A]">
                      {r}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[#8A96A6]">None stated.</p>
              )}
            </section>
            <section className="rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold text-[#14213D]">Concerns to handle</h2>
              {analysis.objections.length ? (
                <ul className="mt-2 space-y-1.5">
                  {analysis.objections.map((o) => (
                    <li key={o} className="flex gap-2 text-sm text-[#34445A]">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ backgroundColor: TIER_META.warm.color }} aria-hidden />
                      {o}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[#8A96A6]">No concerns raised.</p>
              )}
            </section>
          </div>

          {/* e. Score breakdown */}
          {tier && (
            <section className="rounded-lg border bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-[#14213D]">
                Why it scores {lead.score}
              </h2>
              <ScoreBreakdown breakdown={analysis.score_breakdown} tier={tier} reason={analysis.score_reason} />
            </section>
          )}

          {/* f. Suggested response */}
          <section className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[#14213D]">Suggested reply</h2>
              <CopyButton text={analysis.suggested_response} label="Copy reply" />
            </div>
            <p className="mt-3 whitespace-pre-wrap rounded-lg rounded-tl-none border-l-4 border-[#14213D] bg-[#F3F5F8] p-3 text-sm leading-relaxed text-[#14213D]">
              {analysis.suggested_response}
            </p>
            <p className="mt-2 text-xs text-[#8A96A6]">Ask the coach to make it more assertive, shorter or WhatsApp style.</p>
          </section>
        </>
      )}

      {/* g. Original inquiry, collapsed */}
      <details className="group rounded-lg border bg-white">
        <summary className="cursor-pointer list-none rounded-lg p-4 text-sm font-semibold text-[#14213D] outline-none focus-visible:ring-2 focus-visible:ring-[#14213D] [&::-webkit-details-marker]:hidden">
          <span className="mr-1.5 inline-block transition-transform group-open:rotate-90" aria-hidden>
            ›
          </span>
          Original inquiry
        </summary>
        <div className="border-t px-4 pb-4 pt-3 text-sm">
          <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1.5">
            <dt className="text-[#5B6B80]">Requirement</dt>
            <dd className="text-[#14213D]">{lead.property_requirement}</dd>
            <dt className="text-[#5B6B80]">Budget</dt>
            <dd className="text-[#14213D]">{lead.budget}</dd>
            <dt className="text-[#5B6B80]">Timeline</dt>
            <dd className="text-[#14213D]">{TIMELINE_LABELS[lead.timeline] ?? lead.timeline}</dd>
            <dt className="text-[#5B6B80]">Received</dt>
            <dd className="text-[#14213D]" suppressHydrationWarning>
              {new Date(lead.created_at).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Kolkata",
              })}
            </dd>
          </dl>
          <p className="mt-3 whitespace-pre-wrap rounded-md bg-[#F3F5F8] p-3 leading-relaxed text-[#2D3B4E]">{lead.message}</p>
        </div>
      </details>

      <Dialog open={confirmDelete} onOpenChange={(o) => !deleting && setConfirmDelete(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {lead.name}?</DialogTitle>
            <DialogDescription>This removes the lead and its chat history. It cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button onClick={remove} disabled={deleting} className="bg-[#C8233C] text-white hover:bg-[#9A1A2E]">
              {deleting && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Delete lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
