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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Either participant can fetch a signed URL for the finished strip. */
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
    if (!role) return apiError(400, "Missing participant role.");

    const session = await loadSession(roomId);
    await requireParticipant(session, role, token);

    if (session.status !== "RESULTS_READY" || !session.final_strip_path) {
      return apiError(409, "The photo strip isn't ready yet.");
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(session.final_strip_path, 3600);
    if (error || !data) throw new ApiError(500, "Could not load the photo strip.");

    return NextResponse.json({ url: data.signedUrl });
  } catch (err) {
    if (err instanceof ApiError) return apiError(err.status, err.message);
    return apiError(500, "Something went wrong.");
  }
}
