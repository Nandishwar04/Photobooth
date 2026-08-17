"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Link2, Copy, Check } from "lucide-react";
import { useCamera } from "@/hooks/useCamera";
import { useSessionRealtime } from "@/hooks/useSessionRealtime";
import { CameraPreview } from "@/components/CameraPreview";
import { CaptureButton } from "@/components/CaptureButton";
import { Countdown } from "@/components/Countdown";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { WaitingScreen } from "@/components/WaitingScreen";
import { ShotProgress } from "@/components/ShotProgress";
import { QRCode } from "@/components/QRCode";
import { captureFrame } from "@/lib/camera";
import { measureClockOffset } from "@/lib/synchronization";
import {
  requestCapture,
  uploadPhotoWithRetry,
  fetchPhotosForComposition,
  finalizeStrip,
} from "@/lib/photoStorage";
import { composePhotoStrip } from "@/lib/photoComposer";
import { loadCredentials } from "@/lib/credentials";
import type { StoredCredentials } from "@/types/photobooth";

type UploadState = "idle" | "uploading" | "error";

export default function SessionPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId.toUpperCase();
  const router = useRouter();

  const [creds] = useState<StoredCredentials | null>(() => loadCredentials(roomId));

  useEffect(() => {
    if (!creds) router.replace(`/join/${roomId}`);
  }, [creds, roomId, router]);

  const role = creds?.role ?? null;
  const { session, loading, error, otherPresent, refetch } = useSessionRealtime(roomId, role);

  const { videoRef, status: cameraStatus, error: cameraError, requestCamera } = useCamera({
    facingMode: "user",
  });

  const [offsetMs, setOffsetMs] = useState(0);
  const [offsetReady, setOffsetReady] = useState(false);

  useEffect(() => {
    if (!creds) return;
    void requestCamera();
    measureClockOffset().then((sync) => {
      setOffsetMs(sync.offsetMs);
      setOffsetReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds]);

  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const lastCaptureRef = useRef<{
    blob: Blob;
    shotNumber: number;
    captureSeq: number;
  } | null>(null);

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);

  const performUpload = useCallback(
    async (blob: Blob, shotNumber: number, captureSeq: number) => {
      if (!creds) return;
      lastCaptureRef.current = { blob, shotNumber, captureSeq };
      setUploadState("uploading");
      setUploadErrorMessage(null);
      try {
        await uploadPhotoWithRetry(roomId, creds, blob, shotNumber, captureSeq);
        setUploadState("idle");
      } catch (err) {
        setUploadErrorMessage(err instanceof Error ? err.message : "Unknown error");
        setUploadState("error");
      }
    },
    [creds, roomId]
  );

  const handleLocalCapture = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession || !videoRef.current) return;
    try {
      const blob = await captureFrame(videoRef.current, { mirror: true });
      await performUpload(blob, currentSession.current_shot, currentSession.capture_seq);
    } catch (err) {
      setUploadErrorMessage(err instanceof Error ? err.message : "Camera capture failed");
      setUploadState("error");
    }
  }, [performUpload, videoRef]);

  const retryUpload = useCallback(() => {
    const last = lastCaptureRef.current;
    if (!last) return;
    void performUpload(last.blob, last.shotNumber, last.captureSeq);
  }, [performUpload]);

  const [captureRequesting, setCaptureRequesting] = useState(false);
  const handlePressCapture = useCallback(async () => {
    if (!creds || captureRequesting) return;
    setCaptureRequesting(true);
    try {
      await requestCapture(roomId, creds);
    } catch {
      // Session realtime state will reflect the true status regardless;
      // a stale/duplicate press simply gets rejected server-side.
    } finally {
      setCaptureRequesting(false);
    }
  }, [creds, captureRequesting, roomId]);

  const finalizeRoundRef = useRef<number | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !creds || role !== "HOST") return;
    if (session.status !== "FINALIZING") return;
    if (finalizeRoundRef.current === session.round) return;
    finalizeRoundRef.current = session.round;
    setFinalizeError(null);

    (async () => {
      try {
        const photos = await fetchPhotosForComposition(roomId, creds);
        const blob = await composePhotoStrip(photos);
        await finalizeStrip(roomId, creds, blob);
      } catch (err) {
        finalizeRoundRef.current = null;
        setFinalizeError(
          err instanceof Error ? err.message : "Could not put your photos together."
        );
      }
    })();
  }, [session, creds, role, roomId]);

  const [copied, setCopied] = useState(false);
  const guestLink = typeof window !== "undefined" ? `${window.location.origin}/join/${roomId}` : "";
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(guestLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable — link is still visible/selectable on screen.
    }
  };

  if (!creds || loading || !session) {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-rose" aria-hidden />
      </Centered>
    );
  }

  if (error) {
    return (
      <Centered>
        <p className="font-display text-2xl text-ink">Something went wrong.</p>
        <p className="font-body text-sm text-umber">{error}</p>
        <button onClick={refetch} className="rounded-full bg-rose px-5 py-2.5 font-body text-sm text-cream">
          Try again
        </button>
      </Centered>
    );
  }

  if (session.status === "EXPIRED") {
    return (
      <Centered>
        <p className="font-display text-2xl text-ink">This photobooth link has expired.</p>
        <p className="font-body text-sm text-umber">Ask for a fresh link to make a new memory.</p>
      </Centered>
    );
  }

  if (session.status === "RESULTS_READY") {
    return (
      <Centered>
        <p className="font-display text-2xl text-ink">
          {role === "HOST" ? "Your photos are ready ❤️" : "Our photos are ready ❤️"}
        </p>
        <button
          onClick={() => router.push(`/results/${roomId}`)}
          className="rounded-full bg-rose px-6 py-3.5 font-body text-sm font-medium text-cream shadow-lg transition-transform active:scale-95"
        >
          View Results
        </button>
      </Centered>
    );
  }

  const orientation = role === "HOST" ? "landscape" : "portrait";

  return (
    <main className="full-screen-safe safe-top safe-bottom flex flex-col items-center gap-6 px-6 py-8">
      <ConnectionStatus
        online={otherPresent}
        label={otherPresent ? (role === "HOST" ? "She's here" : "Connected") : "Waiting…"}
      />

      <div className="w-full max-w-sm">
        <CameraPreview
          videoRef={videoRef}
          status={cameraStatus}
          error={cameraError}
          orientation={orientation}
        />
      </div>

      {session.status !== "WAITING_FOR_GUEST" && (
        <ShotProgress currentShot={session.current_shot} totalShots={session.total_shots} />
      )}

      {session.status === "WAITING_FOR_GUEST" && role === "HOST" && (
        <div className="flex w-full max-w-sm flex-col items-center gap-4">
          <WaitingScreen
            title="Waiting for your person…"
            subtitle="Send her this link, or have her scan the code."
          />
          <QRCode value={guestLink} />
          <button
            onClick={copyLink}
            className="flex items-center gap-2 rounded-full border border-rose/40 bg-cream px-4 py-2 font-body text-sm text-rose"
          >
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? "Copied!" : "Copy invite link"}
          </button>
        </div>
      )}

      {session.status === "WAITING_FOR_GUEST" && role === "GUEST" && (
        <WaitingScreen title="Getting things ready…" />
      )}

      {session.status === "READY" && (
        <div className="flex flex-col items-center gap-5">
          <p className="font-display text-xl text-ink">We&apos;re ready ❤️</p>
          {role === "GUEST" ? (
            <CaptureButton
              onPress={() => void handlePressCapture()}
              disabled={captureRequesting || !offsetReady}
            />
          ) : (
            <p className="font-body text-sm text-umber">
              {offsetReady ? "Waiting for her to press capture…" : "Syncing…"}
            </p>
          )}
        </div>
      )}

      {session.status === "COUNTDOWN" && session.capture_at && (
        <Countdown
          key={session.capture_at}
          captureAt={session.capture_at}
          offsetMs={offsetMs}
          onCapture={handleLocalCapture}
        />
      )}

      {session.status === "COUNTDOWN" && uploadState === "idle" && (
        <p className="font-body text-sm text-umber">Waiting for the other photo…</p>
      )}

      {uploadState === "uploading" && (
        <div className="flex items-center gap-2 font-body text-sm text-umber">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Saving your photo…
        </div>
      )}
      {uploadState === "error" && (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="font-body text-sm text-rose">
            Couldn&apos;t save your photo{uploadErrorMessage ? `: ${uploadErrorMessage}` : "."}
          </p>
          <button onClick={retryUpload} className="rounded-full bg-rose px-4 py-2 font-body text-sm text-cream">
            Retry
          </button>
        </div>
      )}

      {session.status === "FINALIZING" && (
        <div className="flex flex-col items-center gap-3">
          <WaitingScreen title="Putting our photos together… ❤️" />
          {finalizeError && role === "HOST" && (
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="font-body text-sm text-rose">{finalizeError}</p>
              <button
                onClick={() => {
                  finalizeRoundRef.current = null;
                  setFinalizeError(null);
                }}
                className="rounded-full bg-rose px-4 py-2 font-body text-sm text-cream"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {!otherPresent && session.status !== "WAITING_FOR_GUEST" && (
        <div className="flex items-center gap-2 rounded-full bg-ink/5 px-4 py-2 font-body text-xs text-umber">
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          {role === "HOST" ? "She's" : "The other camera's"} connection dropped — we&apos;ll pick back up
          when it&apos;s back.
        </div>
      )}
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
