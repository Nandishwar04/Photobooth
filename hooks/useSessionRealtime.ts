"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { fetchSession } from "@/lib/photoStorage";
import type { ParticipantRole, PublicSession } from "@/types/photobooth";

interface UseSessionRealtimeResult {
  session: PublicSession | null;
  loading: boolean;
  error: string | null;
  /** Whether the *other* participant's browser tab is currently open and subscribed. */
  otherPresent: boolean;
  refetch: () => Promise<void>;
}

/**
 * Subscribes to the `sessions` row for this room via Supabase Realtime
 * (postgres_changes on UPDATE) so both devices see the same state
 * machine transitions without polling. Also uses Realtime Presence on
 * the same channel purely as a live "is the other tab still open"
 * signal — separate from the durable `guest_connected`/`host_connected`
 * flags on the row, which only ever record "has joined at least once".
 */
export function useSessionRealtime(
  roomId: string,
  selfRole: ParticipantRole | null
): UseSessionRealtimeResult {
  const [session, setSession] = useState<PublicSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [otherPresent, setOtherPresent] = useState(false);
  const otherRole = selfRole === "HOST" ? "GUEST" : "HOST";

  const refetch = useCallback(async () => {
    try {
      const data = await fetchSession(roomId);
      setSession(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load session.");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;
    // refetch() awaits a network call before setting any state — the
    // actual setState calls happen in an async continuation, not
    // synchronously within this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch();

    if (!selfRole) return;

    console.log("[REALTIME] subscribing session room:", roomId);
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`room:${roomId}`, { config: { presence: { key: selfRole } } })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (cancelled) return;
          const next = payload.new as PublicSession;
          console.log(
            `[REALTIME] event received status=${next.status} currentShot=${next.current_shot} ` +
              `captureSeq=${next.capture_seq}`
          );
          setSession(next);
        }
      )
      .on("presence", { event: "sync" }, () => {
        if (cancelled) return;
        const state = channel.presenceState<{ role: ParticipantRole }>();
        setOtherPresent(Boolean(state[otherRole]?.length));
      })
      .subscribe(async (status) => {
        console.log("[REALTIME] subscription status:", status);
        if (status === "SUBSCRIBED") {
          await channel.track({ role: selfRole, at: Date.now() });
        }
      });

    // Modest fallback: Realtime is the primary sync mechanism, but a
    // dropped/missed event shouldn't be able to strand a participant
    // mid-shoot. A low-frequency background reconciliation poll costs
    // one small GET every few seconds and guarantees the authoritative
    // server state eventually reaches this client even if a realtime
    // event never arrives.
    const pollId = setInterval(() => {
      if (!cancelled) refetch();
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, selfRole]);

  return { session, loading, error, otherPresent, refetch };
}
