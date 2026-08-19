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

    console.log(
      `[UPLOAD] session=${roomId} role=${role} shot=${session.current_shot} ` +
        `captureSeq=${claimedSeq} previousStatus=${session.status}`
    );
    console.log("[UPLOAD] photo metadata inserted for", role, "shot", session.current_shot);

    // Flag-set + "did both sides finish" check + advancement all happen
    // inside a single atomic UPDATE in this function (see migration
    // 0002_atomic_shot_completion.sql) — a separate SELECT-then-UPDATE
    // from application code can't be made race-free against two
    // requests arriving within milliseconds of each other, which is
    // exactly what synchronized capture produces on every shot.
    const { data: advanced, error: advanceError } = await supabase.rpc("advance_shot_on_upload", {
      p_session_id: session.id,
      p_role: role,
      p_capture_seq: claimedSeq,
    });
    if (advanceError) {
      console.log("[UPLOAD] advance_shot_on_upload error:", advanceError.message);
      throw new ApiError(500, "Something went wrong.");
    }

    if (!advanced) {
      // capture_seq moved on under us — the round already advanced via
      // the other participant's request; our photo is saved regardless.
      console.log("[UPLOAD] capture round already moved on, nothing further to do");
      return NextResponse.json({ ok: true });
    }

    console.log(
      `[UPLOAD] host_shot_uploaded=${advanced.host_shot_uploaded} ` +
        `guest_shot_uploaded=${advanced.guest_shot_uploaded} ` +
        `both=${advanced.host_shot_uploaded && advanced.guest_shot_uploaded} ` +
        `nextStatus=${advanced.status} currentShot=${advanced.current_shot}`
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return apiError(err.status, err.message);
    return apiError(500, "Something went wrong.");
  }
}
