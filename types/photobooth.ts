/**
 * Shared types for the photobooth app. These mirror the Supabase schema
 * (see supabase/migrations) and the typed realtime/event contracts used
 * between the browser and the API routes.
 */

export type ParticipantRole = "HOST" | "GUEST";

/**
 * Explicit session state machine. The `sessions` table is the single
 * source of truth; every transition happens server-side inside an API
 * route so the client can never forge a state. COUNTDOWN and the moment
 * of capture are the exception: once `capture_at` is broadcast, each
 * client independently schedules and performs the actual local capture
 * against its own synchronized clock rather than waiting for another
 * network round trip (see lib/synchronization.ts).
 */
export type SessionStatus =
  | "WAITING_FOR_GUEST"
  | "READY"
  | "COUNTDOWN"
  | "CAPTURING"
  | "PHOTO_SAVED"
  | "NEXT_SHOT"
  | "FINALIZING"
  | "RESULTS_READY"
  | "EXPIRED"
  | "ERROR";

export interface PhotoboothSession {
  id: string;
  room_id: string;
  status: SessionStatus;
  host_connected: boolean;
  guest_connected: boolean;
  current_shot: number;
  total_shots: number;
  round: number;
  capture_at: string | null;
  capture_seq: number;
  host_shot_uploaded: boolean;
  guest_shot_uploaded: boolean;
  final_strip_path: string | null;
  created_at: string;
  expires_at: string;
  updated_at: string;
}

/** Public-safe projection of a session row (no tokens, ever). */
export type PublicSession = PhotoboothSession;

export interface PhotoRecord {
  id: string;
  session_id: string;
  round: number;
  participant_role: ParticipantRole;
  shot_number: number;
  storage_path: string;
  created_at: string;
}

/**
 * Typed realtime/lifecycle events. These are conceptual labels for the
 * transitions the app makes (mostly derived from `sessions` row changes,
 * plus a couple of client-local/presence events); keeping them as a
 * union avoids scattering ad-hoc strings through the codebase.
 */
export type PhotoboothEvent =
  | { type: "SESSION_CREATED"; roomId: string }
  | { type: "GUEST_JOINED" }
  | { type: "SESSION_READY" }
  | { type: "CAPTURE_REQUESTED"; captureAt: string; captureSeq: number; shotNumber: number }
  | { type: "CAPTURE_SCHEDULED"; captureAt: string; delayMs: number }
  | { type: "CAPTURE_STARTED" }
  | { type: "PHOTO_CAPTURED"; shotNumber: number; role: ParticipantRole }
  | { type: "PHOTO_UPLOADED"; shotNumber: number; role: ParticipantRole }
  | { type: "SHOT_COMPLETED"; shotNumber: number }
  | { type: "ALL_SHOTS_COMPLETED" }
  | { type: "FINALIZING" }
  | { type: "RESULTS_READY"; finalStripPath: string }
  | { type: "SESSION_EXPIRED" }
  | { type: "PARTICIPANT_DISCONNECTED"; role: ParticipantRole };

export interface StoredCredentials {
  roomId: string;
  role: ParticipantRole;
  token: string;
}

export interface CreateSessionResponse {
  roomId: string;
  token: string;
  expiresAt: string;
}

export interface JoinSessionResponse {
  roomId: string;
  token: string;
}

export interface RequestCaptureResponse {
  captureAt: string;
  captureSeq: number;
  shotNumber: number;
  serverNow: string;
}

export interface TimeSyncResponse {
  serverTime: number;
}

export interface SignedPhoto {
  role: ParticipantRole;
  shotNumber: number;
  url: string;
}
