import type { TimeSyncResponse } from "@/types/photobooth";

/**
 * Clock synchronization
 * ----------------------
 * Both browsers need to agree on "when" a shared future timestamp
 * (`capture_at`, an ISO string in server time) actually is on their own
 * local clock, without the server ever pushing a "capture now" message
 * to either device — that would make the two captures only as close
 * together as the difference in network latency to each device, which
 * can easily be 50-300ms+ on mobile and is exactly what this design
 * avoids.
 *
 * Approach (classic NTP-style offset estimation, simplified):
 *   1. The client fires several requests to GET /api/time in sequence.
 *   2. For each round trip it records t0 (local send time), t1 (server
 *      time in the response), and t3 (local receive time).
 *   3. Assuming the request and response legs take roughly the same
 *      time, the server's clock reads `t1 + rtt/2` at the moment
 *      `t0 + rtt/2` on the local clock, i.e.
 *        offset = t1 - (t0 + t3) / 2
 *      where rtt = t3 - t0.
 *   4. We keep the sample with the smallest RTT (least jitter, most
 *      trustworthy estimate of the true one-way delay) rather than
 *      averaging all samples, since a single slow/queued request can
 *      badly skew a mean.
 *
 * `localNow() + offset` then estimates the current server time, and
 * `serverTimeToLocal(t)` converts a server timestamp back to "how many
 * ms from now, on my clock" so a capture can be scheduled with
 * setTimeout/requestAnimationFrame against the local clock only.
 */

export interface ClockSync {
  offsetMs: number;
  rttMs: number;
  samples: number;
}

const TIME_ENDPOINT = "/api/time";

export async function measureClockOffset(sampleCount = 5): Promise<ClockSync> {
  let best: ClockSync | null = null;

  for (let i = 0; i < sampleCount; i++) {
    const t0 = Date.now();
    try {
      const res = await fetch(TIME_ENDPOINT, { cache: "no-store" });
      const t3 = Date.now();
      if (!res.ok) continue;
      const body = (await res.json()) as TimeSyncResponse;
      const rtt = t3 - t0;
      const offset = body.serverTime - (t0 + t3) / 2;

      if (!best || rtt < best.rttMs) {
        best = { offsetMs: offset, rttMs: rtt, samples: i + 1 };
      }
    } catch {
      // Ignore a failed sample; we just try to get enough good ones.
    }
  }

  return best ?? { offsetMs: 0, rttMs: 0, samples: 0 };
}

export function estimateServerNow(offsetMs: number): number {
  return Date.now() + offsetMs;
}

/** ms from "now" (local clock) until the given server-time ISO timestamp. */
export function msUntilServerTime(targetIso: string, offsetMs: number): number {
  const targetLocal = new Date(targetIso).getTime() - offsetMs;
  return targetLocal - Date.now();
}

export interface ScheduledCaptureHandle {
  cancel: () => void;
}

/**
 * Schedules `onCapture` to run as close as practically possible to
 * `targetIso` (server time), using `offsetMs` to translate it onto the
 * local clock. setTimeout alone has enough drift (throttled background
 * tabs, timer coalescing) that we use it only to get within ~30ms of
 * the target, then busy-poll via requestAnimationFrame for the last
 * stretch, which on an active/foregrounded tab reliably lands within a
 * frame (~16ms) of the intended instant.
 */
export function scheduleCapture(
  targetIso: string,
  offsetMs: number,
  callbacks: {
    onTick?: (msRemaining: number) => void;
    onCapture: () => void;
  }
): ScheduledCaptureHandle {
  let cancelled = false;
  let rafId: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let tickIntervalId: ReturnType<typeof setInterval> | null = null;

  const fire = () => {
    if (cancelled) return;
    cancelled = true;
    callbacks.onCapture();
  };

  const armFinalApproach = () => {
    const step = () => {
      if (cancelled) return;
      const remaining = msUntilServerTime(targetIso, offsetMs);
      if (remaining <= 0) {
        fire();
        return;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  };

  if (callbacks.onTick) {
    tickIntervalId = setInterval(() => {
      if (cancelled) return;
      callbacks.onTick?.(Math.max(0, msUntilServerTime(targetIso, offsetMs)));
    }, 100);
  }

  const initialRemaining = msUntilServerTime(targetIso, offsetMs);
  const coarseDelay = Math.max(0, initialRemaining - 30);
  timeoutId = setTimeout(armFinalApproach, coarseDelay);

  return {
    cancel: () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (tickIntervalId) clearInterval(tickIntervalId);
      if (rafId !== null) cancelAnimationFrame(rafId);
    },
  };
}
