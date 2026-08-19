"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CameraError, startCamera, stopCamera, type StartCameraOptions } from "@/lib/camera";

export type CameraStatus = "idle" | "requesting" | "ready" | "error";

interface CameraContextValue {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: CameraStatus;
  error: CameraError | null;
  requestCamera: (options?: StartCameraOptions) => Promise<void>;
  releaseCamera: () => void;
}

const CameraContext = createContext<CameraContextValue | null>(null);

function logTrack(label: string, stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  if (!track) {
    console.log(`[CAMERA] ${label}: no video track on stream`);
    return;
  }
  console.log(
    `[CAMERA] ${label}: readyState=${track.readyState} enabled=${track.enabled} ` +
      `muted=${track.muted} label="${track.label}" settings=`,
    track.getSettings()
  );
}

/**
 * Attaches `stream` directly to `video` (the SAME MediaStream object,
 * not a synthesized copy — see the comment on CameraProvider below for
 * why that distinction matters) and waits for real frames to actually
 * arrive (videoWidth/videoHeight populate) rather than trusting
 * `.play()` resolving as proof the feed is live.
 */
async function attachStream(video: HTMLVideoElement, stream: MediaStream, timeoutMs = 2500): Promise<boolean> {
  console.log("[CAMERA] attachStream: assigning srcObject, stream id:", stream.id);
  video.srcObject = stream;
  console.log("[CAMERA] attachStream: srcObject === stream ?", video.srcObject === stream);

  try {
    await video.play();
    console.log("[CAMERA] attachStream: video.play() resolved");
  } catch (err) {
    console.log("[CAMERA] attachStream: video.play() rejected:", err);
  }

  if (video.videoWidth && video.videoHeight) {
    console.log(`[CAMERA] attachStream: dimensions already available ${video.videoWidth}x${video.videoHeight}`);
    return true;
  }

  console.log("[CAMERA] attachStream: waiting for dimensions...");
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (video.videoWidth && video.videoHeight) {
        console.log(
          `[CAMERA] attachStream: dimensions arrived after ${Date.now() - start}ms: ` +
            `${video.videoWidth}x${video.videoHeight} readyState=${video.readyState}`
        );
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        console.log(
          `[CAMERA] attachStream: TIMED OUT after ${timeoutMs}ms waiting for dimensions. ` +
            `readyState=${video.readyState} paused=${video.paused} networkState=${video.networkState}`
        );
        resolve(false);
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

/**
 * Owns a single camera session for the entire booth flow (create/join ->
 * session), mounted once at the root layout so it survives client-side
 * navigation between those pages.
 *
 * Why this exists: each page used to call getUserMedia() independently.
 * Navigating from /join to /session tore down the join page's stream and
 * immediately requested a brand new one on the session page, and browsers
 * don't always release camera hardware instantly, so the new request
 * could come back stalled right when a synchronized capture needed it.
 * Keeping the MediaStream alive here and re-attaching the SAME stream
 * object to whichever page's <video> element is currently mounted avoids
 * that race without needing to re-request hardware or re-prompt for
 * permission.
 *
 * IMPORTANT: attach the original MediaStream object directly, not a
 * `new MediaStream(stream.getVideoTracks())` copy. An earlier version of
 * this file synthesized a fresh MediaStream wrapper per attachment on
 * the theory that it would help the reused-stream case; that wrapping is
 * a known-unreliable pattern on WebKit/Safari and some Android WebViews —
 * the wrapped stream's tracks can report `readyState: "live"` (hardware
 * stays on, hence the camera indicator staying lit) while the <video>
 * element never actually decodes a frame. That regression affected the
 * FRESH-acquisition path too (not just reuse), which is why it broke the
 * host's very first camera attachment, not just cross-page navigation.
 */
export function CameraProvider({ children }: { children: React.ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<CameraError | null>(null);

  const requestCamera = useCallback(async (options: StartCameraOptions = { facingMode: "user" }) => {
    console.log("[CAMERA] requestCamera called with options:", options);
    const hasLiveStream =
      streamRef.current && streamRef.current.getVideoTracks().some((t) => t.readyState === "live");
    console.log("[CAMERA] hasLiveStream:", !!hasLiveStream);

    setStatus("requesting");
    setError(null);

    if (hasLiveStream && streamRef.current) {
      if (videoRef.current) {
        console.log("[CAMERA] reusing existing stream, video ref available:", !!videoRef.current);
        const gotFrames = await attachStream(videoRef.current, streamRef.current);
        if (gotFrames) {
          console.log("[CAMERA] reuse succeeded, status -> ready");
          setStatus("ready");
          return;
        }
        console.log("[CAMERA] reuse produced no frames, releasing and requesting fresh stream");
        stopCamera(streamRef.current);
        streamRef.current = null;
      } else {
        console.log("[CAMERA] videoRef.current is null — video element not mounted yet");
      }
    }

    try {
      console.log("[CAMERA] getUserMedia requested");
      const stream = await startCamera(options);
      console.log("[CAMERA] getUserMedia success, stream id:", stream.id);
      logTrack("new stream", stream);
      streamRef.current = stream;

      if (!videoRef.current) {
        console.log("[CAMERA] WARNING: videoRef.current is null right after getUserMedia success");
      }
      const gotFrames = videoRef.current ? await attachStream(videoRef.current, stream) : true;
      if (!gotFrames) {
        throw new CameraError("UNKNOWN", "The camera connected but isn't sending video. Try again.");
      }
      console.log("[CAMERA] status -> ready");
      setStatus("ready");
    } catch (err) {
      const camErr =
        err instanceof CameraError ? err : new CameraError("UNKNOWN", "Could not access the camera.");
      console.log("[CAMERA] error:", camErr.reason, camErr.message, err);
      setError(camErr);
      setStatus("error");
    }
  }, []);

  const releaseCamera = useCallback(() => {
    console.log("[CAMERA] releaseCamera called explicitly, stopping tracks");
    stopCamera(streamRef.current);
    streamRef.current = null;
    setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
      console.log("[CAMERA] CameraProvider unmount cleanup — stopping tracks");
      stopCamera(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  return (
    <CameraContext.Provider value={{ videoRef, status, error, requestCamera, releaseCamera }}>
      {children}
    </CameraContext.Provider>
  );
}

export function useSharedCamera(): CameraContextValue {
  const ctx = useContext(CameraContext);
  if (!ctx) throw new Error("useSharedCamera must be used within a CameraProvider");
  return ctx;
}
