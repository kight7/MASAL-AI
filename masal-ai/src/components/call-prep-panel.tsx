"use client";

import { forwardRef, useState } from "react";
import { Ban, Check, ClipboardList, LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import type { StoredCallPrep } from "@/lib/ai/schemas";
import { INVENTORY } from "@/lib/matching";
import type { Lead } from "@/lib/types";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function propertyName(id: string | null): string | null {
  if (!id) return null;
  const p = INVENTORY.find((x) => x.id === id);
  return p ? `${p.project}, ${p.title} (${p.id})` : id;
}

function asText(lead: Lead, prep: StoredCallPrep): string {
  const prop = propertyName(prep.property_to_mention.property_id);
  return [
    `Call prep: ${lead.name}`,
    `Goal: ${prep.call_goal}`,
    `Opening: ${prep.opening_line}`,
    "",
    "Ask:",
    ...prep.questions.map(
      (q, i) => `${prep.asked.includes(i) ? "[x]" : "[ ]"} ${q.question}${q.priority === "must_ask" ? " (must ask)" : ""}`
    ),
    "",
    prop ? `Mention: ${prop} - ${prep.property_to_mention.how}` : `Property: ${prep.property_to_mention.how}`,
    ...(prep.avoid.length ? ["", "Avoid:", ...prep.avoid.map((a) => `- ${a}`)] : []),
    "",
    `Close: ${prep.closing_ask}`,
  ].join("\n");
}

/**
 * Generation lives in a hook so the "Prep for call" button in the Next Action box can trigger it
 * directly from its click handler (no effects needed).
 */
export function useCallPrep(lead: Lead, onLeadChange: (lead: Lead) => void) {
  const [generating, setGenerating] = useState(false);

  async function generate() {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/call-prep`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Could not prepare the call. Please try again.");
        return;
      }
      const leadRes = await fetch(`/api/leads/${lead.id}`, { cache: "no-store" });
      if (leadRes.ok) onLeadChange((await leadRes.json()) as Lead);
    } catch {
      toast.error("Network error. Check your connection and try again.");
    } finally {
      setGenerating(false);
    }
  }

  return { generating, generate };
}

type Props = {
  lead: Lead;
  onLeadChange: (lead: Lead) => void;
  generating: boolean;
  onGenerate: () => void;
};

/** One-screen brief for the next call, with a checklist the salesperson ticks while talking. */
export const CallPrepPanel = forwardRef<HTMLElement, Props>(function CallPrepPanel(
  { lead, onLeadChange, generating, onGenerate },
  ref
) {
  const prep = lead.call_prep;
  // Optimistic ticks: shown immediately, reverted if saving fails.
  const [pendingAsked, setPendingAsked] = useState<number[] | null>(null);
  const asked = pendingAsked ?? prep?.asked ?? [];

  async function toggle(i: number) {
    if (!prep) return;
    const next = asked.includes(i) ? asked.filter((x) => x !== i) : [...asked, i].sort((a, b) => a - b);
    setPendingAsked(next);
    try {
      const res = await fetch(`/api/leads/${lead.id}/call-prep`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asked: next }),
      });
      if (!res.ok) throw new Error();
      onLeadChange({ ...lead, call_prep: { ...prep, asked: next } });
    } catch {
      toast.error("Could not save that tick. Please try again.");
    } finally {
      setPendingAsked(null);
    }
  }

  return (
    <section ref={ref} className="scroll-mt-20 rounded-lg border bg-white p-4" aria-labelledby="prep-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="prep-title" className="flex items-center gap-2 text-sm font-semibold text-[#14213D]">
          <ClipboardList className="size-4" aria-hidden />
          Call prep
          {prep && (
            <span className="font-normal text-[#8A96A6]" suppressHydrationWarning>
              prepared {timeAgo(lead.call_prep_at)}
            </span>
          )}
        </h2>
        {prep && (
          <div className="flex gap-2">
            <CopyButton text={asText(lead, { ...prep, asked })} label="Copy all as text" />
            <Button variant="outline" size="sm" onClick={onGenerate} disabled={generating} className="h-10 sm:h-8">
              {generating ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
              {generating ? "Preparing…" : "Regenerate"}
            </Button>
          </div>
        )}
      </div>

      {!prep && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#5B6B80]">
            Get the questions to ask, what to avoid and the commitment to close on, before you dial.
          </p>
          <Button onClick={onGenerate} disabled={generating} className="h-10 bg-[#14213D] text-white hover:bg-[#1F3157]">
            {generating ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ClipboardList className="size-4" aria-hidden />}
            {generating ? "Preparing…" : "Prep for call"}
          </Button>
        </div>
      )}

      {prep && (
        <div className="mt-3 space-y-4">
          <p className="text-[15px] font-semibold leading-snug text-[#14213D]">{prep.call_goal}</p>

          <div className="rounded-md bg-[#F3F5F8] p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-[#14213D]">
                <span className="font-medium text-[#5B6B80]">Open with: </span>
                {prep.opening_line}
              </p>
              <CopyButton text={prep.opening_line} label="Copy opening line" showLabel={false} className="shrink-0" />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[#14213D]">
              Ask{" "}
              <span className="font-normal tabular-nums text-[#8A96A6]">
                ({asked.length}/{prep.questions.length} done)
              </span>
            </h3>
            <ul className="mt-2 space-y-1.5">
              {prep.questions.map((q, i) => {
                const done = asked.includes(i);
                return (
                  <li key={i}>
                    <label className="flex min-h-10 cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-[#F3F5F8]">
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => void toggle(i)}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border peer-focus-visible:ring-2 peer-focus-visible:ring-[#14213D] ${
                          done ? "border-[#14213D] bg-[#14213D] text-white" : "border-[#9FB0C4] bg-white"
                        }`}
                      >
                        {done && <Check className="size-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className={`text-sm ${done ? "text-[#8A96A6] line-through" : "text-[#14213D]"}`}>
                          {q.question}
                        </span>
                        {q.priority === "must_ask" && !done && (
                          <span className="ml-2 rounded bg-[#FCEBEE] px-1.5 py-0.5 align-middle text-[11px] font-semibold text-[#9A1A2E]">
                            Must ask
                          </span>
                        )}
                        <span className="block text-xs text-[#8A96A6]">{q.why}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <h3 className="text-xs font-semibold text-[#5B6B80]">Property to mention</h3>
              {propertyName(prep.property_to_mention.property_id) && (
                <p className="mt-1 text-sm font-semibold text-[#14213D]">
                  {propertyName(prep.property_to_mention.property_id)}
                </p>
              )}
              <p className="mt-1 text-sm text-[#34445A]">{prep.property_to_mention.how}</p>
            </div>
            {prep.avoid.length > 0 && (
              <div className="rounded-md border border-[#F5DFB0] bg-[#FFF9EC] p-3">
                <h3 className="text-xs font-semibold text-[#875400]">Avoid</h3>
                <ul className="mt-1 space-y-1">
                  {prep.avoid.map((a) => (
                    <li key={a} className="flex gap-2 text-sm text-[#5C3B00]">
                      <Ban className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <p className="rounded-md bg-[#14213D] px-3 py-2 text-sm text-white">
            <span className="font-semibold">Close by asking: </span>
            {prep.closing_ask}
          </p>
        </div>
      )}
    </section>
  );
});
