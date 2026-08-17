import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { createRoomId } from "@/lib/rooms";
import { apiError } from "@/lib/sessionServer";
import type { CreateSessionResponse } from "@/types/photobooth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXPIRY_HOURS = Number(process.env.SESSION_EXPIRY_HOURS ?? 24);

/** Host creates a brand-new private photobooth session. */
export async function POST() {
  const supabase = getSupabaseAdminClient();

  let roomId = createRoomId();

  // Vanishingly unlikely to collide, but guard against it anyway.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await supabase
      .from("sessions")
      .select("id")
      .eq("room_id", roomId)
      .maybeSingle();
    if (!data) break;
    roomId = createRoomId();
  }

  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({
      room_id: roomId,
      status: "WAITING_FOR_GUEST",
      host_connected: true,
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error || !session) return apiError(500, "Could not create your photobooth.");

  const { data: secrets, error: secretsError } = await supabase
    .from("session_secrets")
    .insert({ session_id: session.id })
    .select("host_token")
    .single();

  if (secretsError || !secrets) return apiError(500, "Could not create your photobooth.");

  const response: CreateSessionResponse = {
    roomId,
    token: secrets.host_token,
    expiresAt,
  };
  return NextResponse.json(response);
}
