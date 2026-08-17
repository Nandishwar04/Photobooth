import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { isValidRoomId } from "@/lib/rooms";
import { ApiError, apiError, getBearerToken, loadSession } from "@/lib/sessionServer";
import type { JoinSessionResponse } from "@/types/photobooth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Guest joins a room. At most one guest may ever occupy a session: if a
 * guest_token already exists, the caller must present that exact token
 * (a page refresh / reconnect) or they're rejected as a third participant.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId: rawRoomId } = await params;
  const roomId = rawRoomId.toUpperCase();
  if (!isValidRoomId(roomId)) return apiError(400, "That link doesn't look right.");

  try {
    const session = await loadSession(roomId);
    if (session.status === "EXPIRED") {
      return apiError(410, "This photobooth link has expired.");
    }

    const supabase = getSupabaseAdminClient();
    const existingToken = getBearerToken(req);

    const { data: secrets, error: secretsError } = await supabase
      .from("session_secrets")
      .select("guest_token")
      .eq("session_id", session.id)
      .maybeSingle();
    if (secretsError || !secrets) throw new ApiError(500, "Could not join this photobooth.");

    if (secrets.guest_token) {
      if (existingToken && existingToken === secrets.guest_token) {
        const response: JoinSessionResponse = { roomId, token: secrets.guest_token };
        return NextResponse.json(response);
      }
      return apiError(403, "This photobooth is already full ❤️");
    }

    const { data: updatedSecrets, error: assignError } = await supabase
      .from("session_secrets")
      .update({ guest_token: crypto.randomUUID() })
      .eq("session_id", session.id)
      .is("guest_token", null)
      .select("guest_token")
      .maybeSingle();

    if (assignError) throw new ApiError(500, "Could not join this photobooth.");
    if (!updatedSecrets) {
      // Lost a race with another simultaneous join attempt.
      return apiError(403, "This photobooth is already full ❤️");
    }

    const nextStatus = session.host_connected ? "READY" : "WAITING_FOR_GUEST";
    await supabase
      .from("sessions")
      .update({ guest_connected: true, status: nextStatus })
      .eq("id", session.id);

    const response: JoinSessionResponse = { roomId, token: updatedSecrets.guest_token };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof ApiError) return apiError(err.status, err.message);
    return apiError(500, "Something went wrong.");
  }
}
