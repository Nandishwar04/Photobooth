import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Sweeps sessions past their expires_at into EXPIRED. Sessions are also
 * lazily flipped to EXPIRED on read (see lib/sessionServer.ts), so this
 * cron isn't load-bearing for correctness — it just keeps stale rows
 * tidy for anyone polling session state without an active client.
 * Wired up via Vercel Cron in vercel.json.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.rpc("expire_stale_sessions");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
