// Service-role Supabase client used by the booking edge functions.
// Uses MY_SUPABASE_* env vars to match the rest of the project's functions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

export function serviceClient() {
  const url =
    Deno.env.get("MY_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey =
    Deno.env.get("MY_SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    "";

  if (!url || !serviceKey) {
    throw new Error("Supabase service-role credentials not configured");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}