"use client";

import clsx from "clsx";

interface ConnectionStatusProps {
  online: boolean;
  label: string;
  className?: string;
}

export function ConnectionStatus({ online, label, className }: ConnectionStatusProps) {
  return (
    <div
      className={clsx(
        "inline-flex items-center gap-2 rounded-full bg-cream/80 px-3 py-1.5 font-body text-xs text-umber shadow-sm backdrop-blur",
        className
      )}
    >
      <span className="relative flex h-2 w-2">
        {online && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose/60" />
        )}
        <span
          className={clsx(
            "relative inline-flex h-2 w-2 rounded-full",
            online ? "bg-rose" : "bg-umber/40"
          )}
        />
      </span>
      {label}
    </div>
  );
}
