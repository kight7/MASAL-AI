import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * Service-role Supabase client. SERVER ONLY: import it from API routes and server
 * components, never from a "use client" file. The service-role key bypasses Row Level
 * Security, so every write in the app goes through this client (contract section 5).
 */

if (typeof window !== "undefined") {
  throw new Error("src/lib/supabase/server.ts was imported in the browser. Use it only on the server.");
}

let client: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }
  client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
