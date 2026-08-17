import { NextResponse } from "next/server";
import { getSupabaseAdminClient, STORAGE_BUCKET } from "@/lib/supabase";
import { isValidRoomId } from "@/lib/rooms";
import {
  ApiError,
  apiError,
  getBearerToken,
  getRole,
  loadSession,
  requireParticipant,
} from "@/lib/sessionServer";
import type { ParticipantRole, SignedPhoto } from "@/types/photobooth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Returns short-lived signed URLs for every photo of the current round.
 * Only the HOST calls this — the host device is the one that performs
 * strip composition (see lib/photoComposer.ts) so photos never need to
 * be exposed publicly or to the guest directly.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId: rawRoomId } = await params;
  const roomId = rawRoomId.toUpperCase();
  if (!isValidRoomId(roomId)) return apiError(400, "That link doesn't look right.");

  try {
    const role = getRole(req);
    const token = getBearerToken(req);
    if (role !== "HOST") return apiError(403, "Not authorized.");

    const session = await loadSession(roomId);
    await requireParticipant(session, "HOST", token);

    if (session.status !== "FINALIZING") {
      return apiError(409, "Photos aren't ready to be composed yet.");
    }

    const supabase = getSupabaseAdminClient();
    const { data: photos, error } = await supabase
      .from("photos")
      .select("participant_role, shot_number, storage_path")
      .eq("session_id", session.id)
      .eq("round", session.round)
      .order("shot_number", { ascending: true });

    if (error) throw new ApiError(500, "Could not load photos.");
    if (!photos || photos.length !== session.total_shots * 2) {
      throw new ApiError(409, "Not all photos have finished uploading yet.");
    }

    const signed: SignedPhoto[] = [];
    for (const photo of photos) {
      const { data: signedUrl, error: signError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(photo.storage_path, 300);
      if (signError || !signedUrl) throw new ApiError(500, "Could not sign photo URLs.");
      signed.push({
        role: photo.participant_role as ParticipantRole,
        shotNumber: photo.shot_number,
        url: signedUrl.signedUrl,
      });
    }

    return NextResponse.json({ photos: signed });
  } catch (err) {
    if (err instanceof ApiError) return apiError(err.status, err.message);
    return apiError(500, "Something went wrong.");
  }
}
