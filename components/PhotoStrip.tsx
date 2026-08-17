"use client";

interface PhotoStripProps {
  imageUrl: string;
}

/**
 * Displays the already-composed final strip (see lib/photoComposer.ts)
 * inside a slightly tilted paper frame so it reads as a printed strip
 * rather than a flat screenshot.
 */
export function PhotoStrip({ imageUrl }: PhotoStripProps) {
  return (
    <div className="mx-auto w-full max-w-sm -rotate-1 rounded-2xl bg-cream p-2 shadow-[0_25px_60px_-20px_rgba(43,37,35,0.45)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="Our photobooth strip"
        className="w-full rounded-xl"
        draggable={false}
      />
    </div>
  );
}
