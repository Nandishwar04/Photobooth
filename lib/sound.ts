/**
 * Synthesizes a short camera-shutter "click" via the Web Audio API
 * instead of shipping a static audio asset. Playback is best-effort:
 * browsers can refuse audio without a prior user gesture, and by the
 * time a capture fires the guest has already tapped Capture (a gesture)
 * but the host has not, so failures here are swallowed rather than
 * surfaced — the visual flash carries the moment either way.
 */
let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  return sharedContext;
}

export async function playShutterSound(): Promise<void> {
  try {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume();

    const now = ctx.currentTime;

    // Two quick noise-ish clicks (open/close) using short filtered
    // envelopes rather than an oscillator, for a percussive "clack".
    const clickAt = (t: number, duration: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.01);
    };

    clickAt(now, 0.045, 1400);
    clickAt(now + 0.07, 0.06, 900);
  } catch {
    // Autoplay/permissions failure — silently skip the sound.
  }
}
