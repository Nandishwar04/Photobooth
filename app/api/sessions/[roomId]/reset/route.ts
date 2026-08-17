import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { isValidRoomId } from "@/lib/rooms";
import {
  ApiError,
  apiError,
  getBearerToken,
  getRole,
  loadSession,
  requireParticipant,
} from "@/lib/sessionServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** "Take Another Set" — starts a fresh round of 4 shots in the same room. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId: rawRoomId } = await params;
  const roomId = rawRoomId.toUpperCase();
  if (!isValidRoomId(roomId)) return apiError(400, "That link doesn't look right.");

  try {
    const role = getRole(req);
    const token = getBearerToken(req);
    if (!role) return apiError(400, "Missing participant role.");

    const session = await loadSession(roomId);
    await requireParticipant(session, role, token);

    if (session.status !== "RESULTS_READY") {
      return apiError(409, "Can only start another set after results are ready.");
    }

    const supabase = getSupabaseAdminClient();
    await supabase
      .from("sessions")
      .update({
        status: "READY",
        current_shot: 1,
        round: session.round + 1,
        capture_at: null,
        host_shot_uploaded: false,
        guest_shot_uploaded: false,
        final_strip_path: null,
      })
      .eq("id", session.id)
      .eq("status", "RESULTS_READY");

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return apiError(err.status, err.message);
    return apiError(500, "Something went wrong.");
  }
}
