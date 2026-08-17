"use client";

import { Check, Heart } from "lucide-react";
import clsx from "clsx";

interface ShotProgressProps {
  currentShot: number;
  totalShots: number;
}

export function ShotProgress({ currentShot, totalShots }: ShotProgressProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="font-body text-sm tracking-wide text-umber">
        Shot {Math.min(currentShot, totalShots)} / {totalShots}
      </p>
      <div className="flex items-center gap-2">
        {Array.from({ length: totalShots }).map((_, i) => {
          const shotNumber = i + 1;
          const done = shotNumber < currentShot;
          const active = shotNumber === currentShot;
          return (
            <div
              key={shotNumber}
              className={clsx(
                "flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
                done && "border-rose bg-rose text-cream",
                active && !done && "border-rose text-rose",
                !done && !active && "border-umber/30 text-umber/40"
              )}
            >
              {done ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Heart
                  className={clsx("h-3 w-3", active ? "fill-rose/20" : "fill-transparent")}
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
