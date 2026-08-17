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
import type { RequestCaptureResponse } from "@/types/photobooth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Far enough ahead that network jitter delivering the message to the
// host has time to settle before the target moment, short enough that
// it doesn't feel laggy to the guest pressing the button.
const CAPTURE_LEAD_MS = 1300;

/**
 * Only the GUEST can request a capture. The server does not "tell" the
 * host to capture — it stamps a shared future timestamp onto the session
 * row. Both browsers pick that up (the guest synchronously from this
 * response, the host asynchronously via Realtime) and independently
 * schedule their own local capture against their own synchronized clock.
 */
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
    if (role !== "GUEST") return apiError(403, "Only the guest can start a shot.");

    const session = await loadSession(roomId);
    await requireParticipant(session, "GUEST", token);

    if (session.status === "EXPIRED") return apiError(410, "This photobooth link has expired.");
    if (!session.host_connected || !session.guest_connected) {
      return apiError(409, "Both cameras need to be connected first.");
    }
    if (session.status !== "READY") {
      return apiError(409, `Can't start a capture while session is ${session.status}.`);
    }

    const serverNow = Date.now();
    const captureAt = new Date(serverNow + CAPTURE_LEAD_MS).toISOString();
    const nextSeq = session.capture_seq + 1;

    const supabase = getSupabaseAdminClient();
    const { data: updated, error } = await supabase
      .from("sessions")
      .update({
        status: "COUNTDOWN",
        capture_at: captureAt,
        capture_seq: nextSeq,
        host_shot_uploaded: false,
        guest_shot_uploaded: false,
      })
      .eq("id", session.id)
      .eq("status", "READY") // optimistic concurrency: only one request wins
      .select("*")
      .maybeSingle();

    if (error) throw new ApiError(500, "Could not schedule the capture.");
    if (!updated) return apiError(409, "A capture is already in progress.");

    const response: RequestCaptureResponse = {
      captureAt,
      captureSeq: nextSeq,
      shotNumber: updated.current_shot,
      serverNow: new Date(serverNow).toISOString(),
    };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof ApiError) return apiError(err.status, err.message);
    return apiError(500, "Something went wrong.");
  }
}
