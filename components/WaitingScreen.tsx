"use client";

import { Heart } from "lucide-react";

interface WaitingScreenProps {
  title: string;
  subtitle?: string;
}

export function WaitingScreen({ title, subtitle }: WaitingScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
      <Heart className="h-8 w-8 animate-pulse-heart fill-blush text-blush" aria-hidden />
      <p className="font-display text-2xl text-ink">{title}</p>
      {subtitle && <p className="max-w-xs font-body text-sm text-umber">{subtitle}</p>}
    </div>
  );
}
