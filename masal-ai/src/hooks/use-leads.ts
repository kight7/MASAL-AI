"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { Lead } from "@/lib/types";

/** Fired by the intake dialog after a lead is created, so the dashboard shows and highlights it. */
export const LEAD_CREATED_EVENT = "masal:lead-created";

/** Fired when a lead changed somewhere else in the app (e.g. sample-lead analysis). Upsert only, no highlight. */
export const LEAD_UPDATED_EVENT = "masal:lead-updated";

export function announceLead(lead: Lead, event: typeof LEAD_CREATED_EVENT | typeof LEAD_UPDATED_EVENT) {
  window.dispatchEvent(new CustomEvent<Lead>(event, { detail: lead }));
}

function isNewer(incoming: Lead, current: Lead): boolean {
  return Date.parse(incoming.updated_at) >= Date.parse(current.updated_at);
}

/**
 * Leads for the dashboard: initial fetch from /api/leads, then live updates.
 *
 * Updates arrive from three places (the API response, the "lead created" event and Supabase
 * Realtime), often for the same lead. Every one goes through upsert(), which matches by id and
 * keeps whichever version has the newest updated_at. So a lead never appears twice, and a late
 * "pending" Realtime event can never overwrite an "analyzed" result.
 */
export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const upsert = useCallback((lead: Lead) => {
    setLeads((prev) => {
      const i = prev.findIndex((l) => l.id === lead.id);
      if (i === -1) return [lead, ...prev];
      if (!isNewer(lead, prev[i])) return prev;
      const next = prev.slice();
      next[i] = lead;
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
  }, []);

  /** Fetch only (no state changes), so it can run from an effect and from event handlers. */
  const fetchLeads = useCallback(async (): Promise<{ leads: Lead[] } | { error: string }> => {
    try {
      const res = await fetch("/api/leads", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) return { error: body?.error ?? "Could not load leads" };
      return { leads: body as Lead[] };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not load leads" };
    }
  }, []);

  const applyResult = useCallback((result: { leads: Lead[] } | { error: string }) => {
    if (!mounted.current) return;
    if ("leads" in result) {
      setLeads(result.leads);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    applyResult(await fetchLeads());
  }, [fetchLeads, applyResult]);

  useEffect(() => {
    mounted.current = true;
    // Initial load: state is only set in the promise callback, never synchronously in the effect.
    fetchLeads().then(applyResult);

    // Live updates. If Realtime is not configured, the app still works with manual refresh.
    let cleanupRealtime = () => {};
    try {
      const supabase = getBrowserSupabase();
      const channel = supabase
        .channel("leads-dashboard")
        .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            if (id) remove(id);
          } else {
            upsert(payload.new as Lead);
          }
        })
        .subscribe();
      cleanupRealtime = () => {
        void supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn("[leads] Realtime unavailable:", err);
    }

    const onCreated = (e: Event) => upsert((e as CustomEvent<Lead>).detail);
    window.addEventListener(LEAD_CREATED_EVENT, onCreated);
    window.addEventListener(LEAD_UPDATED_EVENT, onCreated);

    // Catch up after the tab was in the background (Realtime can miss events while asleep).
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchLeads().then(applyResult);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      mounted.current = false;
      cleanupRealtime();
      window.removeEventListener(LEAD_CREATED_EVENT, onCreated);
      window.removeEventListener(LEAD_UPDATED_EVENT, onCreated);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchLeads, applyResult, upsert, remove]);

  return { leads, loading, error, refresh, addLead: upsert };
}
