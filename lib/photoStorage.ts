import { authHeaders } from "@/lib/credentials";
import type {
  CreateSessionResponse,
  JoinSessionResponse,
  ParticipantRole,
  PublicSession,
  RequestCaptureResponse,
  SignedPhoto,
} from "@/types/photobooth";

export class ApiRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = "Something went wrong.";
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new ApiRequestError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export async function createSession(): Promise<CreateSessionResponse> {
  const res = await fetch("/api/sessions", { method: "POST" });
  return parseJsonOrThrow(res);
}

export async function joinSession(
  roomId: string,
  existingToken?: string
): Promise<JoinSessionResponse> {
  const res = await fetch(`/api/sessions/${roomId}/join`, {
    method: "POST",
    headers: existingToken ? { "x-participant-token": existingToken } : undefined,
  });
  return parseJsonOrThrow(res);
}

export async function fetchSession(roomId: string): Promise<PublicSession> {
  const res = await fetch(`/api/sessions/${roomId}`, { cache: "no-store" });
  return parseJsonOrThrow(res);
}

export async function requestCapture(
  roomId: string,
  creds: { role: ParticipantRole; token: string }
): Promise<RequestCaptureResponse> {
  const res = await fetch(`/api/sessions/${roomId}/request-capture`, {
    method: "POST",
    headers: authHeaders(creds),
  });
  return parseJsonOrThrow(res);
}

export async function uploadPhoto(
  roomId: string,
  creds: { role: ParticipantRole; token: string },
  blob: Blob,
  shotNumber: number,
  captureSeq: number
): Promise<void> {
  const form = new FormData();
  form.append("image", blob, `shot-${shotNumber}.jpg`);
  form.append("shotNumber", String(shotNumber));
  form.append("captureSeq", String(captureSeq));

  const res = await fetch(`/api/sessions/${roomId}/upload-photo`, {
    method: "POST",
    headers: authHeaders(creds),
    body: form,
  });
  await parseJsonOrThrow(res);
}

export async function fetchPhotosForComposition(
  roomId: string,
  creds: { role: ParticipantRole; token: string }
): Promise<SignedPhoto[]> {
  const res = await fetch(`/api/sessions/${roomId}/photos`, {
    headers: authHeaders(creds),
    cache: "no-store",
  });
  const body = await parseJsonOrThrow<{ photos: SignedPhoto[] }>(res);
  return body.photos;
}

export async function finalizeStrip(
  roomId: string,
  creds: { role: ParticipantRole; token: string },
  blob: Blob
): Promise<void> {
  const form = new FormData();
  form.append("image", blob, "final-strip.jpg");
  const res = await fetch(`/api/sessions/${roomId}/finalize`, {
    method: "POST",
    headers: authHeaders(creds),
    body: form,
  });
  await parseJsonOrThrow(res);
}

export async function fetchFinalStripUrl(
  roomId: string,
  creds: { role: ParticipantRole; token: string }
): Promise<string> {
  const res = await fetch(`/api/sessions/${roomId}/final`, {
    headers: authHeaders(creds),
    cache: "no-store",
  });
  const body = await parseJsonOrThrow<{ url: string }>(res);
  return body.url;
}

export async function resetSession(
  roomId: string,
  creds: { role: ParticipantRole; token: string }
): Promise<void> {
  const res = await fetch(`/api/sessions/${roomId}/reset`, {
    method: "POST",
    headers: authHeaders(creds),
  });
  await parseJsonOrThrow(res);
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err instanceof ApiRequestError && err.status < 500) throw err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Upload with a small retry budget for transient/mobile-network failures. */
export function uploadPhotoWithRetry(
  roomId: string,
  creds: { role: ParticipantRole; token: string },
  blob: Blob,
  shotNumber: number,
  captureSeq: number
): Promise<void> {
  return withRetry(() => uploadPhoto(roomId, creds, blob, shotNumber, captureSeq));
}
