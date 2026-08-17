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

/**
 * Attaches `stream` to `video` and waits for real frames to actually
 * start arriving (videoWidth/videoHeight populate), rather than trusting
 * `.play()` resolving as proof the feed is live. Re-assigning the exact
 * same MediaStream object to a brand new <video> element (which is what
 * happens when this stream survives a page navigation) doesn't reliably
 * resume frame delivery on every mobile browser even though the camera
 * hardware itself stays active — wrapping the existing tracks in a fresh
 * MediaStream per attachment is cheap (no renegotiation with the camera)
 * and sidesteps that per-element caching quirk.
 */
async function attachStream(video: HTMLVideoElement, stream: MediaStream, timeoutMs = 2500): Promise<boolean> {
  const perElementStream = new MediaStream(stream.getVideoTracks());
  video.srcObject = perElementStream;
  await video.play().catch(() => undefined);

  if (video.videoWidth && video.videoHeight) return true;

  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (video.videoWidth && video.videoHeight) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
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
 * immediately requested a brand new one on the session page — and
 * browsers (mobile ones especially) don't always release camera hardware
 * instantly, so the new request could come back with a stalled video
 * element right when a synchronized capture needed it. Keeping the
 * MediaStream alive here and just re-attaching it to whichever page's
 * <video> element is currently mounted avoids that race entirely: no
 * teardown, no re-acquisition, no permission re-prompt, no gap in the
 * live preview.
 */
export function CameraProvider({ children }: { children: React.ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<CameraError | null>(null);

  const requestCamera = useCallback(async (options: StartCameraOptions = { facingMode: "user" }) => {
    const hasLiveStream =
      streamRef.current && streamRef.current.getVideoTracks().some((t) => t.readyState === "live");

    setStatus("requesting");
    setError(null);

    if (hasLiveStream && streamRef.current) {
      // Already have a working stream (e.g. we just navigated from
      // /join to /session) — re-attach it to this page's <video> rather
      // than requesting the camera hardware again.
      if (videoRef.current) {
        const gotFrames = await attachStream(videoRef.current, streamRef.current);
        if (gotFrames) {
          setStatus("ready");
          return;
        }
        // Reused attachment never produced a frame — release it and
        // fall through to requesting a fresh stream instead of leaving
        // the user stuck on a dead preview.
        stopCamera(streamRef.current);
        streamRef.current = null;
      }
    }

    try {
      const stream = await startCamera(options);
      streamRef.current = stream;
      const gotFrames = videoRef.current ? await attachStream(videoRef.current, stream) : true;
      if (!gotFrames) {
        throw new CameraError("UNKNOWN", "The camera connected but isn't sending video. Try again.");
      }
      setStatus("ready");
    } catch (err) {
      const camErr =
        err instanceof CameraError ? err : new CameraError("UNKNOWN", "Could not access the camera.");
      setError(camErr);
      setStatus("error");
    }
  }, []);

  const releaseCamera = useCallback(() => {
    stopCamera(streamRef.current);
    streamRef.current = null;
    setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
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
