import type { ParticipantRole, StoredCredentials } from "@/types/photobooth";

/**
 * Per-room participant credentials (role + bearer token) live in
 * localStorage, scoped by room id, so a page refresh can silently
 * reconnect as the same participant instead of being treated as a new
 * (possibly rejected) join attempt.
 */
function storageKey(roomId: string): string {
  return `photobooth:${roomId.toUpperCase()}`;
}

export function saveCredentials(creds: StoredCredentials): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(creds.roomId), JSON.stringify(creds));
}

export function loadCredentials(roomId: string): StoredCredentials | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(roomId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredCredentials;
    if (parsed.roomId && parsed.role && parsed.token) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function clearCredentials(roomId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(roomId));
}

export function authHeaders(creds: {
  role: ParticipantRole;
  token: string;
}): HeadersInit {
  return {
    "x-participant-role": creds.role,
    "x-participant-token": creds.token,
  };
}
