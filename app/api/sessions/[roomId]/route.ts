import { NextResponse } from "next/server";
import { isValidRoomId } from "@/lib/rooms";
import { ApiError, apiError, loadSession } from "@/lib/sessionServer";
import type { PublicSession } from "@/types/photobooth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Public (token-free) session state — used for the initial page load. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId: rawRoomId } = await params;
  const roomId = rawRoomId.toUpperCase();
  if (!isValidRoomId(roomId)) return apiError(400, "That link doesn't look right.");

  try {
    const session = await loadSession(roomId);
    const publicSession: PublicSession = session;
    return NextResponse.json(publicSession, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof ApiError) return apiError(err.status, err.message);
    return apiError(500, "Something went wrong.");
  }
}
