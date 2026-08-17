import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const STORAGE_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "photobooth";

let browserClient: SupabaseClient | null = null;

/**
 * Browser client. Uses only the anon key and is safe to ship to the
 * client bundle. It is used exclusively for read-only Realtime
 * subscriptions to the `sessions` table — all writes and any privileged
 * reads (tokens, signed photo URLs) go through server API routes.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: { params: { eventsPerSecond: 10 } },
      auth: { persistSession: false },
    });
  }
  return browserClient;
}

/**
 * Server-only admin client using the service role key. Must never be
 * imported from a client component. Bypasses RLS, which is exactly why
 * all session/photo mutations are funneled through API routes that use
 * this client instead of trusting the browser.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
