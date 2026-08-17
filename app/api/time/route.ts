import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Trivial time-sync endpoint. The client hits this a handful of times,
 * measures round-trip latency, and estimates its clock offset from the
 * server (see lib/synchronization.ts for the estimator). Kept as cheap
 * and fast as possible since it's on the critical path for capture
 * precision.
 */
export async function GET() {
  return NextResponse.json(
    { serverTime: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
