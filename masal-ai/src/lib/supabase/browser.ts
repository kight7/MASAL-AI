"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * Anon-key Supabase client for the browser, used ONLY for Realtime subscriptions to the
 * leads table. It can read leads (public SELECT policy) but cannot write anything:
 * all writes go through server routes.
 */

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.");
  }
  client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
