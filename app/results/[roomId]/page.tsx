"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Download, Share2, RotateCcw } from "lucide-react";
import { RevealAnimation } from "@/components/RevealAnimation";
import { PhotoStrip } from "@/components/PhotoStrip";
import { BirthdayMessage } from "@/components/BirthdayMessage";
import { loadCredentials } from "@/lib/credentials";
import { fetchSession, fetchFinalStripUrl, resetSession } from "@/lib/photoStorage";
import { useSessionRealtime } from "@/hooks/useSessionRealtime";
import { useSharedCamera } from "@/contexts/CameraContext";
import type { StoredCredentials } from "@/types/photobooth";

export default function ResultsPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId.toUpperCase();
  const router = useRouter();

  const { releaseCamera } = useSharedCamera();
  useEffect(() => {
    // The camera is no longer needed once results are up — release the
    // hardware/indicator rather than leaving it running in the background.
    releaseCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [creds] = useState<StoredCredentials | null>(() => loadCredentials(roomId));
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not-ready" | "error">("loading");
  const [resetting, setResetting] = useState(false);
  const [shareSupported] = useState(
    () => typeof navigator !== "undefined" && "share" in navigator
  );

  useEffect(() => {
    if (!creds) {
      router.replace(`/join/${roomId}`);
      return;
    }
    const found = creds;

    (async () => {
      try {
        const session = await fetchSession(roomId);
        if (session.status !== "RESULTS_READY") {
          setStatus("not-ready");
          return;
        }
        const url = await fetchFinalStripUrl(roomId, found);
        setImageUrl(url);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, router]);

  // If the other participant starts another set (resetting the session
  // back to READY) while we're sitting on this page, follow them back
  // to the shooting flow instead of being stranded on stale results.
  const { session: liveSession } = useSessionRealtime(roomId, creds?.role ?? null);
  useEffect(() => {
    if (status === "ready" && liveSession && liveSession.status !== "RESULTS_READY") {
      router.replace(`/session/${roomId}`);
    }
  }, [liveSession, status, roomId, router]);

  async function handleDownload() {
    if (!imageUrl) return;
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `our-photobooth-${roomId}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(imageUrl, "_blank");
    }
  }

  async function handleShare() {
    if (!imageUrl) return;
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const file = new File([blob], `our-photobooth-${roomId}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Our little photobooth" });
        return;
      }
      await navigator.share({ title: "Our little photobooth", url: imageUrl });
    } catch {
      // User cancelled or share failed — nothing to do.
    }
  }

  async function handleTakeAnother() {
    if (!creds) return;
    setResetting(true);
    try {
      await resetSession(roomId, creds);
      router.push(`/session/${roomId}`);
    } catch {
      setResetting(false);
    }
  }

  if (status === "loading") {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-rose" aria-hidden />
      </Centered>
    );
  }

  if (status === "not-ready") {
    return (
      <Centered>
        <p className="font-display text-2xl text-ink">Not quite ready yet.</p>
        <button
          onClick={() => router.push(`/session/${roomId}`)}
          className="rounded-full bg-rose px-5 py-2.5 font-body text-sm text-cream"
        >
          Back to the photobooth
        </button>
      </Centered>
    );
  }

  if (status === "error" || !imageUrl) {
    return (
      <Centered>
        <p className="font-display text-2xl text-ink">Couldn&apos;t load your photos.</p>
        <button onClick={() => window.location.reload()} className="rounded-full bg-rose px-5 py-2.5 font-body text-sm text-cream">
          Try again
        </button>
      </Centered>
    );
  }

  return (
    <main className="full-screen-safe safe-top safe-bottom flex flex-col items-center px-6 py-8">
      <RevealAnimation>
        <PhotoStrip imageUrl={imageUrl} />
        <BirthdayMessage />

        <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
          <button
            onClick={handleDownload}
            className="flex items-center justify-center gap-2 rounded-full bg-rose px-6 py-3.5 font-body text-sm font-medium text-cream shadow-lg transition-transform active:scale-95"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download
          </button>
          {shareSupported && (
            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-2 rounded-full border border-rose/40 bg-cream px-6 py-3.5 font-body text-sm text-rose transition-transform active:scale-95"
            >
              <Share2 className="h-4 w-4" aria-hidden />
              Share
            </button>
          )}
          <button
            onClick={handleTakeAnother}
            disabled={resetting}
            className="flex items-center justify-center gap-2 rounded-full px-6 py-3.5 font-body text-sm text-umber transition-transform active:scale-95 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {resetting ? "Starting…" : "Take Another Set"}
          </button>
        </div>
      </RevealAnimation>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="full-screen-safe safe-top safe-bottom flex flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </main>
  );
}
