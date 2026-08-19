"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CameraError, startCamera, stopCamera, type StartCameraOptions } from "@/lib/camera";

export type CameraStatus = "idle" | "requesting" | "ready" | "error";

interface CameraContextValue {
  /** Read-only: current <video> element, kept in sync by setVideoElement. */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Pass this as the <video>'s `ref` prop — NOT videoRef directly. */
  setVideoElement: (element: HTMLVideoElement | null) => void;
  status: CameraStatus;
  error: CameraError | null;
  requestCamera: (options?: StartCameraOptions) => Promise<void>;
  releaseCamera: () => void;
}

const CameraContext = createContext<CameraContextValue | null>(null);

function hasLiveVideoTrack(stream: MediaStream | null): stream is MediaStream {
  return !!stream && stream.getVideoTracks().some((t) => t.readyState === "live");
}

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
 * Attaches `stream` directly to `video` (the SAME MediaStream object, not
 * a synthesized copy — an earlier version wrapped tracks in
 * `new MediaStream(stream.getVideoTracks())` per attachment, which is an
 * unreliable pattern on WebKit/Safari and some Android WebViews: tracks
 * keep reporting readyState "live" while the <video> element never
 * actually decodes a frame from the wrapper) and waits for real frames to
 * arrive rather than trusting `.play()` resolving as proof the feed is live.
 */
async function attachStream(video: HTMLVideoElement, stream: MediaStream, timeoutMs = 2500): Promise<boolean> {
  console.log("[CAMERA] attachStream: assigning srcObject, stream id:", stream.id);
  video.srcObject = stream;

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
 * Stream ACQUISITION (getUserMedia) and stream ATTACHMENT (assigning
 * srcObject to a <video> element) are deliberately separate operations
 * here, triggered by two different, independent events:
 *
 *   - requestCamera() acquires a stream (or reuses the existing one).
 *   - setVideoElement() — passed as the <video ref={...}> callback —
 *     attaches whatever stream currently exists the instant any page's
 *     video element mounts.
 *
 * This matters because a page's first render can happen before its own
 * data has loaded (e.g. SessionPage renders a loading spinner — no
 * CameraPreview, no <video> — until `session` arrives), while its camera
 * effect still fires on that same first render since it only depends on
 * `creds`, which is available immediately. Coupling attachment to
 * "whichever ran first, the effect or the mount" was the root cause of
 * the stream being acquired successfully but never attached to any
 * video element. A callback ref makes attachment happen exactly when a
 * video element becomes available, regardless of which happens first.
 */
export function CameraProvider({ children }: { children: React.ReactNode }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<CameraError | null>(null);

  const setVideoElement = useCallback((element: HTMLVideoElement | null) => {
    console.log("[CAMERA] video element ref:", element ? "mounted" : "unmounted");
    videoRef.current = element;

    if (element && hasLiveVideoTrack(streamRef.current)) {
      console.log("[CAMERA] attaching existing stream to newly mounted video");
      const stream = streamRef.current;
      void attachStream(element, stream).then((gotFrames) => {
        // Bail if a different/newer video element replaced this one
        // while we were awaiting attachment.
        if (videoRef.current !== element) return;
        if (gotFrames) {
          setStatus("ready");
        } else {
          setError(new CameraError("UNKNOWN", "The camera connected but isn't sending video. Try again."));
          setStatus("error");
        }
      });
    }
  }, []);

  const requestCamera = useCallback(async (options: StartCameraOptions = { facingMode: "user" }) => {
    console.log("[CAMERA] requestCamera called with options:", options);
    const reusable = hasLiveVideoTrack(streamRef.current);
    console.log("[CAMERA] existing live stream to reuse:", reusable);

    if (reusable && streamRef.current) {
      // A live stream already exists — never acquire another one.
      if (videoRef.current) {
        setStatus("requesting");
        const gotFrames = await attachStream(videoRef.current, streamRef.current);
        if (gotFrames) {
          setStatus("ready");
        } else {
          setError(new CameraError("UNKNOWN", "The camera connected but isn't sending video. Try again."));
          setStatus("error");
        }
      } else {
        // No video element mounted on this page yet — setVideoElement
        // will attach the existing stream the moment one does.
        console.log("[CAMERA] stream is live but no video element mounted yet; will attach on mount");
        setStatus("requesting");
      }
      return;
    }

    setStatus("requesting");
    setError(null);
    try {
      console.log("[CAMERA] getUserMedia requested");
      const stream = await startCamera(options);
      console.log("[CAMERA] getUserMedia success, stream id:", stream.id);
      logTrack("new stream", stream);
      streamRef.current = stream;

      if (videoRef.current) {
        const gotFrames = await attachStream(videoRef.current, stream);
        if (!gotFrames) {
          throw new CameraError("UNKNOWN", "The camera connected but isn't sending video. Try again.");
        }
        setStatus("ready");
      } else {
        // Video element isn't mounted yet (e.g. this page is still
        // showing a loading state) — setVideoElement will attach this
        // stream and flip status to "ready" once it mounts.
        console.log("[CAMERA] stream acquired, no video element mounted yet; will attach on mount");
      }
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
    <CameraContext.Provider value={{ videoRef, setVideoElement, status, error, requestCamera, releaseCamera }}>
      {children}
    </CameraContext.Provider>
  );
}

export function useSharedCamera(): CameraContextValue {
  const ctx = useContext(CameraContext);
  if (!ctx) throw new Error("useSharedCamera must be used within a CameraProvider");
  return ctx;
}
