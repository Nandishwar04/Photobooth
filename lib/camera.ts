/**
 * Thin wrapper around getUserMedia. Deliberately does not touch React
 * state — callers should keep the returned MediaStream in a ref and
 * attach it to a <video> element directly, since piping live video
 * frames through React state would cause constant re-renders.
 */

export type CameraErrorReason =
  | "NOT_SUPPORTED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "IN_USE"
  | "UNKNOWN";

export class CameraError extends Error {
  reason: CameraErrorReason;
  constructor(reason: CameraErrorReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface StartCameraOptions {
  /** "user" = front/selfie camera (guest), "environment" = rear camera. */
  facingMode?: "user" | "environment";
  width?: number;
  height?: number;
}

export function isCameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

export async function startCamera(options: StartCameraOptions = {}): Promise<MediaStream> {
  if (!isCameraSupported()) {
    throw new CameraError("NOT_SUPPORTED", "This browser can't access a camera.");
  }

  const constraints: MediaStreamConstraints = {
    audio: false,
    video: {
      facingMode: options.facingMode ?? "user",
      width: { ideal: options.width ?? 1280 },
      height: { ideal: options.height ?? 960 },
    },
  };

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    throw mapGetUserMediaError(err);
  }
}

function mapGetUserMediaError(err: unknown): CameraError {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return new CameraError(
        "PERMISSION_DENIED",
        "Camera access was denied."
      );
    case "NotFoundError":
    case "OverconstrainedError":
      return new CameraError("NOT_FOUND", "No usable camera was found.");
    case "NotReadableError":
    case "TrackStartError":
      return new CameraError("IN_USE", "The camera is already in use by another app.");
    default:
      return new CameraError("UNKNOWN", "Could not access the camera.");
  }
}

export function stopCamera(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

/**
 * Grabs the current video frame into a JPEG blob via an offscreen
 * canvas. Mirrors the video horizontally when `mirror` is true so a
 * front-facing camera preview matches what the user sees of themself
 * (getUserMedia frames from a front camera are not pre-mirrored).
 */
export async function captureFrame(
  video: HTMLVideoElement,
  options: { mirror?: boolean; maxWidth?: number; quality?: number } = {}
): Promise<Blob> {
  const { mirror = false, maxWidth = 1280, quality = 0.85 } = options;

  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) {
    throw new CameraError("UNKNOWN", "Camera isn't ready yet.");
  }

  const scale = Math.min(1, maxWidth / sourceWidth);
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CameraError("UNKNOWN", "Could not process the photo.");

  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new CameraError("UNKNOWN", "Could not encode photo."))),
      "image/jpeg",
      quality
    );
  });
}
