"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CameraOff } from "lucide-react";
import { useSharedCamera } from "@/contexts/CameraContext";
import { CameraPreview } from "@/components/CameraPreview";
import { createSession } from "@/lib/photoStorage";
import { saveCredentials } from "@/lib/credentials";

type Step = "camera" | "creating" | "error";

export default function CreatePage() {
  const router = useRouter();
  const { videoRef, status, error, requestCamera } = useSharedCamera();
  const [step, setStep] = useState<Step>("camera");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    await requestCamera({ facingMode: "user" });
    setStep("creating");
    try {
      const { roomId, token } = await createSession();
      saveCredentials({ roomId, role: "HOST", token });
      router.push(`/session/${roomId}`);
    } catch (err) {
      setStep("error");
      setErrorMessage(err instanceof Error ? err.message : "Could not create your photobooth.");
    }
  }

  return (
    <main className="full-screen-safe safe-top safe-bottom flex flex-col items-center justify-center gap-6 px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="font-display text-2xl text-ink">Setting up your photobooth</h1>
          <p className="mt-1 font-body text-sm text-umber">Just a moment&hellip;</p>
        </div>

        <CameraPreview
          videoRef={videoRef}
          status={status}
          error={error}
          orientation="landscape"
          className="w-full"
        />

        {status === "error" && (
          <button
            onClick={() => void requestCamera({ facingMode: "user" })}
            className="rounded-full border border-rose px-5 py-2.5 font-body text-sm text-rose"
          >
            Try camera again
          </button>
        )}

        {step === "creating" && (
          <div className="flex items-center gap-2 font-body text-sm text-umber">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Creating your private room…
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <CameraOff className="h-6 w-6 text-rose" aria-hidden />
            <p className="font-body text-sm text-umber">{errorMessage}</p>
            <button
              onClick={run}
              className="rounded-full bg-rose px-5 py-2.5 font-body text-sm text-cream"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
