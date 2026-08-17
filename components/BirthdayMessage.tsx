"use client";

import { Heart } from "lucide-react";

export function BirthdayMessage() {
  return (
    <div className="mt-8 flex flex-col items-center gap-2 text-center">
      <p className="font-display text-3xl text-ink sm:text-4xl">Happy Birthday</p>
      <Heart className="h-6 w-6 fill-rose text-rose" aria-hidden />
      <p className="max-w-xs font-hand text-2xl text-umber">
        every little moment with you is one worth keeping.
      </p>
    </div>
  );
}
