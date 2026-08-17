import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { ParticipantRole, PhotoboothSession } from "@/types/photobooth";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function apiError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Loads a session by room_id, flipping it to EXPIRED on read if it's past expiry. */
export async function loadSession(roomId: string): Promise<PhotoboothSession> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("room_id", roomId)
    .maybeSingle();

  if (error) throw new ApiError(500, "Failed to load session");
  if (!data) throw new ApiError(404, "This photobooth doesn't exist anymore.");

  const session = data as PhotoboothSession;
  if (session.status !== "EXPIRED" && new Date(session.expires_at) < new Date()) {
    const { data: updated } = await supabase
      .from("sessions")
      .update({ status: "EXPIRED" })
      .eq("id", session.id)
      .select("*")
      .single();
    return (updated as PhotoboothSession) ?? { ...session, status: "EXPIRED" };
  }
  return session;
}

/**
 * Validates that `token` is the bearer secret for `role` on this session.
 * This is the sole authorization mechanism in the app: there are no user
 * accounts, so possession of the per-role token (issued once at
 * create/join time and stored client-side) is what proves a request is
 * really coming from the host or the guest of this specific session.
 */
export async function requireParticipant(
  session: PhotoboothSession,
  role: ParticipantRole,
  token: string | null
): Promise<void> {
  if (!token) throw new ApiError(401, "Missing participant token");
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("session_secrets")
    .select("host_token, guest_token")
    .eq("session_id", session.id)
    .maybeSingle();

  if (error || !data) throw new ApiError(500, "Failed to validate participant");

  const expected = role === "HOST" ? data.host_token : data.guest_token;
  if (!expected || expected !== token) {
    throw new ApiError(403, "Invalid participant token");
  }
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("x-participant-token");
  return header && header.trim().length > 0 ? header.trim() : null;
}

export function getRole(req: Request): ParticipantRole | null {
  const role = req.headers.get("x-participant-role");
  return role === "HOST" || role === "GUEST" ? role : null;
}
