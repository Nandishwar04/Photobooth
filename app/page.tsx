import Link from "next/link";
import { Heart } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="full-screen-safe safe-top safe-bottom flex flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-[32px] border border-ink/5 bg-cream/80 px-8 py-12 text-center shadow-[0_25px_60px_-25px_rgba(43,37,35,0.35)]">
        <Heart className="h-8 w-8 fill-blush text-blush" aria-hidden />
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl text-ink sm:text-4xl">Let&apos;s Make a Memory</h1>
          <p className="font-body text-sm text-umber">A tiny photobooth for two.</p>
        </div>
        <Link
          href="/create"
          className="mt-2 w-full rounded-full bg-rose px-6 py-4 font-body text-base font-medium text-cream shadow-lg transition-transform active:scale-95"
        >
          Create Our Photobooth
        </Link>
      </div>
      <p className="mt-8 font-hand text-xl text-umber">Made for one special day ❤️</p>
    </main>
  );
}
