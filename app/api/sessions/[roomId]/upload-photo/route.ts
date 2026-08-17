import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { STORAGE_BUCKET } from "@/lib/supabase";
import { isValidRoomId, storagePathForShot } from "@/lib/rooms";
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

const MAX_BYTES = 6 * 1024 * 1024; // 6MB — generous ceiling for a single compressed JPEG frame
const ALLOWED_TYPES = new Set(["image/jpeg", "image/webp"]);

/**
 * Uploads one captured frame for the current shot. The client sends the
 * shot number / capture round it *thinks* it's uploading for, but the
 * server treats those as claims to verify against the session row, never
 * as facts — the actual shot number, round, and storage path are always
 * derived server-side.
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
    if (!role) return apiError(400, "Missing participant role.");

    const session = await loadSession(roomId);
    await requireParticipant(session, role, token);

    if (session.status === "EXPIRED") return apiError(410, "This photobooth link has expired.");

    const form = await req.formData();
    const file = form.get("image");
    const claimedShot = Number(form.get("shotNumber"));
    const claimedSeq = Number(form.get("captureSeq"));

    if (!(file instanceof File)) return apiError(400, "Missing image.");
    if (!ALLOWED_TYPES.has(file.type)) return apiError(415, "Unsupported image type.");
    if (file.size === 0 || file.size > MAX_BYTES) return apiError(413, "Image too large.");

    if (session.status !== "COUNTDOWN") {
      return apiError(409, "No capture is currently in progress.");
    }
    if (claimedSeq !== session.capture_seq) {
      return apiError(409, "This capture round has already ended.");
    }
    if (claimedShot !== session.current_shot) {
      return apiError(409, "Shot number does not match the current shot.");
    }

    const supabase = getSupabaseAdminClient();
    const path = storagePathForShot(roomId, session.round, role, session.current_shot);
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: true });
    if (uploadError) throw new ApiError(500, "Could not upload your photo. Please try again.");

    const { error: insertError } = await supabase.from("photos").upsert(
      {
        session_id: session.id,
        round: session.round,
        participant_role: role,
        shot_number: session.current_shot,
        storage_path: path,
      },
      { onConflict: "session_id,round,participant_role,shot_number" }
    );
    if (insertError) throw new ApiError(500, "Could not save your photo. Please try again.");

    const uploadedField = role === "HOST" ? "host_shot_uploaded" : "guest_shot_uploaded";

    // Re-read to make the "did both sides finish" check atomic-enough:
    // reload right before flipping the flag, then decide with fresh data.
    const { data: current, error: reloadError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", session.id)
      .single();
    if (reloadError || !current) throw new ApiError(500, "Something went wrong.");
    if (current.capture_seq !== claimedSeq) {
      // The round moved on while we were uploading (other side already
      // advanced it) — our photo is saved, nothing further to do.
      return NextResponse.json({ ok: true });
    }

    const otherAlreadyUploaded =
      role === "HOST" ? current.guest_shot_uploaded : current.host_shot_uploaded;

    if (otherAlreadyUploaded) {
      const isLastShot = current.current_shot >= current.total_shots;
      await supabase
        .from("sessions")
        .update(
          isLastShot
            ? { status: "FINALIZING", host_shot_uploaded: false, guest_shot_uploaded: false }
            : {
                status: "READY",
                current_shot: current.current_shot + 1,
                capture_at: null,
                host_shot_uploaded: false,
                guest_shot_uploaded: false,
              }
        )
        .eq("id", session.id)
        .eq("capture_seq", claimedSeq);
    } else {
      await supabase
        .from("sessions")
        .update({ [uploadedField]: true })
        .eq("id", session.id)
        .eq("capture_seq", claimedSeq);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return apiError(err.status, err.message);
    return apiError(500, "Something went wrong.");
  }
}
