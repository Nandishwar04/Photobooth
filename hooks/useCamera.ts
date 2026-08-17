"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraError, startCamera, stopCamera, type StartCameraOptions } from "@/lib/camera";

export type CameraStatus = "idle" | "requesting" | "ready" | "error";

interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  streamRef: React.RefObject<MediaStream | null>;
  status: CameraStatus;
  error: CameraError | null;
  requestCamera: () => Promise<void>;
}

/**
 * Owns the camera lifecycle. The live MediaStream is kept entirely in
 * refs (never React state) so incoming frames don't cause re-renders;
 * only the coarse `status` transitions trigger updates.
 */
export function useCamera(options: StartCameraOptions = {}): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<CameraError | null>(null);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const requestCamera = useCallback(async () => {
    setStatus("requesting");
    setError(null);
    try {
      const stream = await startCamera(optionsRef.current);
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

  useEffect(() => {
    return () => {
      stopCamera(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  return { videoRef, streamRef, status, error, requestCamera };
}
