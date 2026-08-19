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

/** Best-effort read of the camera permission state; not supported in every browser (notably Safari). */
export async function queryCameraPermission(): Promise<"granted" | "denied" | "prompt" | "unsupported"> {
  try {
    if (!navigator.permissions?.query) return "unsupported";
    const status = await navigator.permissions.query({ name: "camera" as PermissionName });
    console.log("[CAMERA] permission state:", status.state);
    return status.state as "granted" | "denied" | "prompt";
  } catch (err) {
    console.log("[CAMERA] permission query unsupported/failed:", err);
    return "unsupported";
  }
}

export async function startCamera(options: StartCameraOptions = {}): Promise<MediaStream> {
  if (!isCameraSupported()) {
    throw new CameraError("NOT_SUPPORTED", "This browser can't access a camera.");
  }

  await queryCameraPermission();

  const preferredConstraints: MediaStreamConstraints = {
    audio: false,
    video: {
      facingMode: options.facingMode ?? "user",
      width: { ideal: options.width ?? 1280 },
      height: { ideal: options.height ?? 960 },
    },
  };

  try {
    console.log("[CAMERA] getUserMedia with preferred constraints:", preferredConstraints);
    return await navigator.mediaDevices.getUserMedia(preferredConstraints);
  } catch (err) {
    console.log("[CAMERA] preferred constraints failed:", err, "— retrying with plain {video: true}");
    // Fall back to the simplest possible request. Some devices/browsers
    // reject specific facingMode/resolution constraints (OverconstrainedError)
    // even when a perfectly usable camera exists.
    try {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (fallbackErr) {
      console.log("[CAMERA] fallback constraints also failed:", fallbackErr);
      throw mapGetUserMediaError(fallbackErr);
    }
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
 * Waits briefly for a live MediaStream's frames to actually reach the
 * <video> element (videoWidth/videoHeight populate once real frames are
 * decoding). Normally instant, but a short grace window is cheap
 * insurance against rare timing hiccups right after a stream is
 * (re)attached, rather than failing a synchronized capture outright.
 */
function waitForVideoDimensions(video: HTMLVideoElement, timeoutMs = 800): Promise<void> {
  if (video.videoWidth && video.videoHeight) return Promise.resolve();
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if ((video.videoWidth && video.videoHeight) || Date.now() - start > timeoutMs) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
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

  console.log(
    `[CAMERA] captureFrame: before wait — readyState=${video.readyState} paused=${video.paused} ` +
      `${video.videoWidth}x${video.videoHeight} srcObject=${video.srcObject ? "set" : "none"}`
  );
  await waitForVideoDimensions(video);
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  console.log(`[CAMERA] captureFrame: after wait — ${sourceWidth}x${sourceHeight}`);
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
