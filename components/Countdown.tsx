"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { scheduleCapture } from "@/lib/synchronization";
import { playShutterSound } from "@/lib/sound";

interface CountdownProps {
  captureAt: string;
  offsetMs: number;
  /** Fired exactly once, at the synchronized target instant. */
  onCapture: () => void;
}

/**
 * Fullscreen 3-2-1-CAPTURE overlay. The numbers are a *display* of the
 * schedule computed by lib/synchronization's scheduleCapture — the
 * actual capture callback fires from that same schedule, not from a
 * setInterval tied to the displayed digit, so the visual and the real
 * capture instant can never drift apart from each other.
 *
 * Callers must remount this component per round (e.g. `key={captureAt}`)
 * rather than relying on prop changes to reset it — that keeps the
 * "has fired" state a plain initial value instead of something that
 * needs resetting imperatively inside an effect.
 */
export function Countdown({ captureAt, offsetMs, onCapture }: CountdownProps) {
  const [remainingMs, setRemainingMs] = useState<number>(() =>
    Math.max(0, new Date(captureAt).getTime() - offsetMs - Date.now())
  );
  const [fired, setFired] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const onCaptureRef = useRef(onCapture);
  useEffect(() => {
    onCaptureRef.current = onCapture;
  }, [onCapture]);

  useEffect(() => {
    const handle = scheduleCapture(captureAt, offsetMs, {
      onTick: (ms) => setRemainingMs(ms),
      onCapture: () => {
        setRemainingMs(0);
        setFired(true);
        playShutterSound();
        onCaptureRef.current();
      },
    });
    return () => handle.cancel();
  }, [captureAt, offsetMs]);

  // The overlay's only job is the dramatic 3-2-1-CAPTURE moment. It must
  // not stay mounted waiting for the server to confirm both sides
  // uploaded — that can take a few seconds (or fail entirely on a slow
  // connection), and this is a fixed, full-viewport, z-50 layer that
  // would otherwise bury the camera preview and any upload/error UI
  // underneath it for as long as it's up. So it self-dismisses shortly
  // after the flash, regardless of upload/session state.
  useEffect(() => {
    if (!fired) return;
    const t = setTimeout(() => setOverlayVisible(false), 650);
    return () => clearTimeout(t);
  }, [fired]);

  const secondsLeft = Math.ceil(remainingMs / 1000);
  const display = fired ? "CAPTURE" : secondsLeft > 0 ? String(secondsLeft) : "";

  if (!overlayVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm">
      <AnimatePresence mode="wait">
        <motion.div
          key={display}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.4, opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="font-display text-8xl font-semibold tracking-tight text-cream sm:text-9xl"
        >
          {display}
        </motion.div>
      </AnimatePresence>

      {fired && (
        <motion.div
          className="pointer-events-none fixed inset-0 bg-cream"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.9, 0] }}
          transition={{ duration: 0.4, times: [0, 0.1, 1] }}
        />
      )}
    </div>
  );
}
