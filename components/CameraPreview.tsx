"use client";

import { RefObject } from "react";
import { CameraOff, Loader2 } from "lucide-react";
import clsx from "clsx";
import type { CameraStatus } from "@/contexts/CameraContext";
import type { CameraError } from "@/lib/camera";

interface CameraPreviewProps {
  videoRef: RefObject<HTMLVideoElement>;
  status: CameraStatus;
  error: CameraError | null;
  orientation: "landscape" | "portrait";
  mirror?: boolean;
  className?: string;
}

export function CameraPreview({
  videoRef,
  status,
  error,
  orientation,
  mirror = true,
  className,
}: CameraPreviewProps) {
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-[28px] border border-ink/10 bg-ink shadow-[0_18px_40px_-15px_rgba(43,37,35,0.35)]",
        orientation === "landscape" ? "aspect-[4/3] w-full" : "aspect-[3/4] w-full",
        className
      )}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={clsx(
          "h-full w-full object-cover",
          mirror && "-scale-x-100",
          status !== "ready" && "opacity-0"
        )}
      />

      {status !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/95 text-cream">
          {status === "requesting" && (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-blush" aria-hidden />
              <p className="font-body text-sm text-cream/80">Waking up the camera…</p>
            </>
          )}
          {status === "error" && (
            <>
              <CameraOff className="h-7 w-7 text-blush" aria-hidden />
              <p className="max-w-[220px] text-center font-body text-sm text-cream/80">
                {error?.reason === "PERMISSION_DENIED"
                  ? "Camera access is needed for our little photoshoot."
                  : error?.message ?? "Couldn't reach the camera."}
              </p>
            </>
          )}
          {status === "idle" && (
            <p className="font-body text-sm text-cream/60">Camera is off</p>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-1 ring-inset ring-cream/10" />
    </div>
  );
}
