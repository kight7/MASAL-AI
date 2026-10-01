"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { Lead } from "@/lib/types";

/** Fired by the intake dialog after a lead is created, so the dashboard shows it at once. */
export const LEAD_CREATED_EVENT = "leadlens:lead-created";

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

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/leads", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Could not load leads");
      if (mounted.current) {
        setLeads(body as Lead[]);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : "Could not load leads");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();

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

    // Catch up after the tab was in the background (Realtime can miss events while asleep).
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      mounted.current = false;
      cleanupRealtime();
      window.removeEventListener(LEAD_CREATED_EVENT, onCreated);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, upsert, remove]);

  return { leads, loading, error, refresh, addLead: upsert };
}
