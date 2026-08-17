import { customAlphabet } from "nanoid";
import type { ParticipantRole, SessionStatus } from "@/types/photobooth";

// Unambiguous uppercase alphanumeric alphabet (no 0/O, 1/I) at 10
// characters gives ~5.6x10^14 combinations — not sequential, not
// guessable, and still short enough to read aloud if needed.
const roomIdAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generateRoomId = customAlphabet(roomIdAlphabet, 10);

export function createRoomId(): string {
  return generateRoomId();
}

export function isValidRoomId(roomId: string): boolean {
  return /^[A-Z0-9]{6,16}$/.test(roomId);
}

const STATUS_VALUES: SessionStatus[] = [
  "WAITING_FOR_GUEST",
  "READY",
  "COUNTDOWN",
  "CAPTURING",
  "PHOTO_SAVED",
  "NEXT_SHOT",
  "FINALIZING",
  "RESULTS_READY",
  "EXPIRED",
  "ERROR",
];

export function isSessionStatus(value: string): value is SessionStatus {
  return (STATUS_VALUES as string[]).includes(value);
}

export function otherRole(role: ParticipantRole): ParticipantRole {
  return role === "HOST" ? "GUEST" : "HOST";
}

export function storagePathForShot(
  roomId: string,
  round: number,
  role: ParticipantRole,
  shotNumber: number
): string {
  return `${roomId}/r${round}/shot-${shotNumber}-${role.toLowerCase()}.jpg`;
}

export function storagePathForFinalStrip(roomId: string, round: number): string {
  return `${roomId}/r${round}/final-strip.jpg`;
}
