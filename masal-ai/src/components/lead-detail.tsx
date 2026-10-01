"use client";

import { useEffect, useState } from "react";
import { AnalysisBrief } from "@/components/analysis-brief";
import { ChatPanel } from "@/components/chat-panel";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { Lead, LeadMessage } from "@/lib/types";

type Tab = "brief" | "chat";

/**
 * Lead detail layout. Desktop: brief (about 60%) next to a sticky chat (about 40%).
 * Mobile: two tabs, Brief and Chat. Keeps the lead in sync with Supabase Realtime,
 * so a lead that is still being analysed fills in on its own.
 */
export function LeadDetail({
  initialLead,
  initialMessages,
  enableDelete,
}: {
  initialLead: Lead;
  initialMessages: LeadMessage[];
  enableDelete: boolean;
}) {
  const [lead, setLead] = useState(initialLead);
  const [tab, setTab] = useState<Tab>("brief");

  const updateLead = (next: Lead) =>
    setLead((cur) => (Date.parse(next.updated_at) >= Date.parse(cur.updated_at) ? next : cur));

  useEffect(() => {
    let cleanup = () => {};
    try {
      const supabase = getBrowserSupabase();
      const channel = supabase
        .channel(`lead-${initialLead.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "leads", filter: `id=eq.${initialLead.id}` },
          (payload) => updateLead(payload.new as Lead)
        )
        .subscribe();
      cleanup = () => void supabase.removeChannel(channel);
    } catch (err) {
      console.warn("[lead] Realtime unavailable:", err);
    }
    return cleanup;
  }, [initialLead.id]);

  const tabClass = (t: Tab) =>
    `min-h-10 flex-1 rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#14213D] ${
      tab === t ? "bg-white text-[#14213D] shadow-sm" : "text-[#5B6B80]"
    }`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 lg:py-8">
      {/* Mobile tabs */}
      <div role="tablist" aria-label="Lead views" className="mb-4 flex gap-1 rounded-lg bg-[#E6EBF1] p-1 lg:hidden">
        <button role="tab" id="tab-brief" aria-selected={tab === "brief"} aria-controls="panel-brief" onClick={() => setTab("brief")} className={tabClass("brief")}>
          Brief
        </button>
        <button role="tab" id="tab-chat" aria-selected={tab === "chat"} aria-controls="panel-chat" onClick={() => setTab("chat")} className={tabClass("chat")}>
          Coach
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-6">
        <div id="panel-brief" role="tabpanel" aria-labelledby="tab-brief" className={`${tab === "brief" ? "block" : "hidden"} lg:block`}>
          <AnalysisBrief lead={lead} enableDelete={enableDelete} onLeadChange={updateLead} />
        </div>
        <div
          id="panel-chat"
          role="tabpanel"
          aria-labelledby="tab-chat"
          className={`${tab === "chat" ? "block" : "hidden"} h-[calc(100dvh-8.5rem)] lg:sticky lg:top-20 lg:block lg:h-[calc(100dvh-7rem)]`}
        >
          <ChatPanel lead={lead} initialMessages={initialMessages} />
        </div>
      </div>
    </div>
  );
}
