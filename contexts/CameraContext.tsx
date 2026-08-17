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

    if (hasLiveStream) {
      // Already have a working stream (e.g. we just navigated from
      // /join to /session) — just re-attach it to this page's <video>.
      if (videoRef.current && videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus("ready");
      setError(null);
      return;
    }

    setStatus("requesting");
    setError(null);
    try {
      const stream = await startCamera(options);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
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
