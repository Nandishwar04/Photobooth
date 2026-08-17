"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Heart, Loader2 } from "lucide-react";
import { useSharedCamera } from "@/contexts/CameraContext";
import { CameraPreview } from "@/components/CameraPreview";
import { fetchSession, joinSession, ApiRequestError } from "@/lib/photoStorage";
import { loadCredentials, saveCredentials } from "@/lib/credentials";

type Phase = "checking" | "intro" | "camera" | "joining" | "full" | "gone" | "error";

export default function JoinPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId.toUpperCase();
  const router = useRouter();
  const { videoRef, status, error, requestCamera } = useSharedCamera();
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const existing = loadCredentials(roomId);
    if (existing && existing.role === "GUEST") {
      // Already joined this room before (e.g. page refresh) — skip the intro.
      void beginJoin(existing.token);
      return;
    }

    fetchSession(roomId)
      .then((session) => {
        if (session.status === "EXPIRED") {
          setPhase("gone");
          setMessage("This photobooth link has expired.");
        } else if (session.guest_connected) {
          setPhase("full");
        } else {
          setPhase("intro");
        }
      })
      .catch(() => {
        setPhase("gone");
        setMessage("This photobooth doesn't exist anymore.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  async function beginJoin(existingToken?: string) {
    setPhase("camera");
    await requestCamera({ facingMode: "user" });
    setPhase("joining");
    try {
      const { token } = await joinSession(roomId, existingToken);
      saveCredentials({ roomId, role: "GUEST", token });
      router.push(`/session/${roomId}`);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 403) {
        setPhase("full");
      } else if (err instanceof ApiRequestError && err.status === 410) {
        setPhase("gone");
        setMessage("This photobooth link has expired.");
      } else {
        setPhase("error");
        setMessage(err instanceof Error ? err.message : "Something went wrong.");
      }
    }
  }

  if (phase === "checking") {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-rose" aria-hidden />
      </Centered>
    );
  }

  if (phase === "full") {
    return (
      <Centered>
        <Heart className="h-7 w-7 fill-blush text-blush" aria-hidden />
        <p className="font-display text-2xl text-ink">This photobooth is already full ❤️</p>
      </Centered>
    );
  }

  if (phase === "gone" || phase === "error") {
    return (
      <Centered>
        <p className="font-display text-2xl text-ink">{message ?? "Something went wrong."}</p>
        {phase === "error" && (
          <button
            onClick={() => beginJoin()}
            className="rounded-full bg-rose px-5 py-2.5 font-body text-sm text-cream"
          >
            Try again
          </button>
        )}
      </Centered>
    );
  }

  if (phase === "intro") {
    return (
      <main className="full-screen-safe safe-top safe-bottom flex flex-col items-center justify-center px-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-[32px] border border-ink/5 bg-cream/80 px-8 py-12 text-center shadow-[0_25px_60px_-25px_rgba(43,37,35,0.35)]">
          <Heart className="h-8 w-8 fill-blush text-blush" aria-hidden />
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-3xl text-ink">Your photobooth is waiting ❤️</h1>
            <p className="font-body text-sm text-umber">Grab your camera and let&apos;s take some pictures.</p>
          </div>
          <button
            onClick={() => void beginJoin()}
            className="mt-2 w-full rounded-full bg-rose px-6 py-4 font-body text-base font-medium text-cream shadow-lg transition-transform active:scale-95"
          >
            I&apos;m Ready 📸
          </button>
        </div>
      </main>
    );
  }

  // phase: camera | joining
  return (
    <main className="full-screen-safe safe-top safe-bottom flex flex-col items-center justify-center gap-6 px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <CameraPreview
          videoRef={videoRef}
          status={status}
          error={error}
          orientation="portrait"
          className="w-full max-w-[320px]"
        />
        {status === "error" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="max-w-xs font-body text-sm text-umber">
              Camera access is needed for our little photoshoot. Please allow camera access in
              your browser settings and try again.
            </p>
            <button
              onClick={() => void requestCamera({ facingMode: "user" })}
              className="rounded-full border border-rose px-5 py-2.5 font-body text-sm text-rose"
            >
              Try again
            </button>
          </div>
        )}
        {phase === "joining" && (
          <div className="flex items-center gap-2 font-body text-sm text-umber">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Joining your photobooth…
          </div>
        )}
      </div>
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
