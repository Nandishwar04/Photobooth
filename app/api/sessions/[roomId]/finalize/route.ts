import { NextResponse } from "next/server";
import { getSupabaseAdminClient, STORAGE_BUCKET } from "@/lib/supabase";
import { isValidRoomId, storagePathForFinalStrip } from "@/lib/rooms";
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

const MAX_BYTES = 12 * 1024 * 1024;

/**
 * The HOST device composes the final strip in-browser (Canvas) from the
 * 8 signed photo URLs and posts the resulting image here. The server
 * re-derives the storage path itself (never trusts a client-supplied
 * path) and flips the session to RESULTS_READY once stored.
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
    if (role !== "HOST") return apiError(403, "Not authorized.");

    const session = await loadSession(roomId);
    await requireParticipant(session, "HOST", token);

    if (session.status !== "FINALIZING") {
      return apiError(409, "Session isn't finalizing right now.");
    }

    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return apiError(400, "Missing image.");
    if (file.type !== "image/jpeg") return apiError(415, "Unsupported image type.");
    if (file.size === 0 || file.size > MAX_BYTES) return apiError(413, "Image too large.");

    const supabase = getSupabaseAdminClient();
    const path = storagePathForFinalStrip(roomId, session.round);
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    if (uploadError) throw new ApiError(500, "Could not save the final photo strip.");

    await supabase
      .from("sessions")
      .update({ status: "RESULTS_READY", final_strip_path: path })
      .eq("id", session.id)
      .eq("status", "FINALIZING");

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return apiError(err.status, err.message);
    return apiError(500, "Something went wrong.");
  }
}
