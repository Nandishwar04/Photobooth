"use client";

import { Camera } from "lucide-react";
import clsx from "clsx";

interface CaptureButtonProps {
  onPress: () => void;
  disabled?: boolean;
  label?: string;
}

export function CaptureButton({ onPress, disabled, label = "Capture" }: CaptureButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      className={clsx(
        "group relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full",
        "border-4 border-cream bg-rose shadow-[0_10px_30px_-8px_rgba(201,120,143,0.7)]",
        "transition-transform duration-150 active:scale-90",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
      )}
    >
      <span
        className={clsx(
          "absolute inset-1 rounded-full border-2 border-cream/70",
          !disabled && "group-active:border-cream"
        )}
      />
      <Camera className="h-9 w-9 text-cream" aria-hidden />
    </button>
  );
}
