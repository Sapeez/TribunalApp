// The single point of contact with Supabase. Server-side only — the browser
// never talks to Supabase directly (§11). Uses the SERVICE ROLE key, so this
// file must never be imported from client ("use client") code.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// supabase-js eagerly constructs a realtime client that requires a global
// WebSocket constructor — Node 20 doesn't have one natively (added in Node
// 22). This app never uses realtime subscriptions, but the polyfill is
// needed just to get past SupabaseClient's constructor.
if (!("WebSocket" in globalThis)) {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket;
}

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Locally: copy " +
        ".env.example to .env.local and paste your project's values in. See SETUP.md."
    );
  }

  // Tolerate a URL copied with an extra path (e.g. "/rest/v1") or trailing
  // slash — supabase-js wants just the project origin, e.g.
  // "https://<ref>.supabase.co".
  const origin = new URL(url).origin;

  client = createClient(origin, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return client;
}
