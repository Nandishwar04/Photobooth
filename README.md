# Let's Make a Memory — a two-device photobooth for one birthday

A private, link-only, two-person photobooth. The host opens it on a laptop,
sends a link to the guest, both cameras stay local to each device, and four
synchronized capture rounds get stitched into one vertical photobooth strip
that both people see together at the end.

There are no accounts, no public gallery, and no third participant — just a
room, two cameras, and a surprise reveal.

## 1. Overview

- **Frontend**: Next.js 16 (App Router), React 18, TypeScript (strict),
  Tailwind CSS, Framer Motion, Lucide icons.
- **Backend**: Supabase — Postgres for session/photo state, Realtime for
  cross-device sync, Storage for the photos and final strip.
- **Camera**: native `getUserMedia` + `<video>` + Canvas, all client-side.
- **Composition**: the final strip is composed entirely in the browser via
  Canvas (on the host device) — no server-side image library required.
- **Deployment**: Vercel serverless functions (Next.js Route Handlers) +
  Vercel Cron for session expiry cleanup. No long-running custom server.

## 2. Architecture

```
app/
  page.tsx                    landing ("Create Our Photobooth")
  create/page.tsx             host: camera + create room + redirect
  join/[roomId]/page.tsx      guest: camera + join room + redirect
  session/[roomId]/page.tsx   the whole shooting flow (state machine UI)
  results/[roomId]/page.tsx   reveal + final strip + download/share
  api/
    time/route.ts                        clock-sync endpoint
    sessions/route.ts                    POST create session (host)
    sessions/[roomId]/route.ts           GET public session state
    sessions/[roomId]/join/route.ts      POST guest join
    sessions/[roomId]/request-capture/   POST schedule a synchronized capture
    sessions/[roomId]/upload-photo/      POST upload one captured shot
    sessions/[roomId]/photos/            GET signed URLs for composition (host)
    sessions/[roomId]/finalize/          POST upload the composed strip
    sessions/[roomId]/final/             GET signed URL of the final strip
    sessions/[roomId]/reset/             POST "take another set"
    cron/expire/route.ts                 sweeps expired sessions

components/   CameraPreview, CaptureButton, Countdown, ConnectionStatus,
              WaitingScreen, ShotProgress, PhotoStrip, RevealAnimation,
              BirthdayMessage, QRCode
hooks/        useCamera, useSessionRealtime
lib/          supabase, camera, synchronization, rooms, sessionServer,
              credentials, photoStorage, photoComposer, sound
types/        photobooth.ts (shared types + state machine)
supabase/migrations/0001_init.sql
```

### Why no accounts, but still secure?

There's no user auth system — the two participants are identified by
**possession of a bearer token**, not a login. When a session is created or
joined, the server mints a random `host_token` / `guest_token` and returns it
once; the browser stores it in `localStorage` scoped to that room and sends
it back as a header (`x-participant-role` / `x-participant-token`) on every
API call. Every write goes through a Next.js Route Handler using the
Supabase **service-role** key, which validates that token server-side before
doing anything — the client never gets to assert its own role, shot number,
or session status. Tokens are stored in a separate `session_secrets` table
that the browser's `anon` key has no access to at all (see §9).

### State machine

`sessions.status` is the single source of truth, synchronized to both
devices via Supabase Realtime (`postgres_changes` on `UPDATE`):

```
WAITING_FOR_GUEST → READY → COUNTDOWN → (upload both sides) →
  READY (next shot) ... → FINALIZING → RESULTS_READY
                                             │
                                   "Take Another Set" → READY (new round)
```

`EXPIRED` and `ERROR` can be entered from most states. The full type union
(including the purely local/visual `CAPTURING`, `PHOTO_SAVED`, `NEXT_SHOT`
labels used in `types/photobooth.ts`) documents every conceptual transition
even where the implementation folds a couple of them into one DB write for
simplicity — see the comment in `types/photobooth.ts`.

## 3. Local setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project's values
npm run dev
```

Open http://localhost:3000.

## 4. Supabase setup

1. Create a project at https://supabase.com.
2. In the SQL editor, run `supabase/migrations/0001_init.sql`. It creates:
   - `sessions`, `session_secrets`, `photos` tables, indexes, and a
     `set_updated_at` trigger.
   - Row Level Security: `sessions` is readable by `anon`/`authenticated`
     (needed for the Realtime subscription — see §9 for why this is safe);
     `session_secrets` and `photos` have **no** grants to those roles at
     all, so they're only reachable via the service-role key.
   - A private Storage bucket named `photobooth`.
   - An `expire_stale_sessions()` function for the cron sweep.
3. Enable Realtime for the `sessions` table (Database → Replication →
   toggle `sessions` on) if it isn't already covered by the default
   publication.
4. Grab your project URL, `anon` public key, and `service_role` secret key
   from Project Settings → API.

## 5. Environment variables

See `.env.example`:

| Variable | Where it's used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser (Realtime subscription only) | public |
| `SUPABASE_SERVICE_ROLE_KEY` | server (API routes only) | **secret — never expose to the browser** |
| `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` | browser + server | defaults to `photobooth` |
| `SESSION_EXPIRY_HOURS` | server | defaults to `24` |
| `CRON_SECRET` | server, optional | if set, `/api/cron/expire` requires `Authorization: Bearer <secret>` |

## 6. Database migration

The single migration file is `supabase/migrations/0001_init.sql`, meant to be
run once via the Supabase SQL editor or the Supabase CLI
(`supabase db push`). It's idempotent for the storage bucket creation and
uses `if not exists` throughout, so re-running it is safe.

## 7. Storage configuration

The `photobooth` bucket is created **private** by the migration itself. No
public bucket policy is needed because every read goes through the server:
`app/api/sessions/[roomId]/photos` and `.../final` mint short-lived signed
URLs (5 minutes for composition, 1 hour for viewing the final strip) using
the service-role key. The browser never talks to Storage directly.

## 8. Local development

```bash
npm run dev         # dev server
npm run build        # production build
npm run start         # run the production build
npm run lint            # ESLint (flat config, eslint-config-next)
npm run typecheck        # tsc --noEmit, strict mode
```

## 9. Deploying to Vercel

1. Push this repo to GitHub (or your Git provider of choice).
2. Import it in Vercel.
3. Add the environment variables from §5 in Project Settings → Environment
   Variables (Production + Preview). **Do not** add `SUPABASE_SERVICE_ROLE_KEY`
   with a `NEXT_PUBLIC_` prefix.
4. Deploy. Every route in this app is either a static page or a Node.js
   serverless Route Handler (`export const runtime = "nodejs"`), so it
   fits Vercel's default serverless model with no custom server.
5. `vercel.json` already wires up a Vercel Cron job hitting
   `/api/cron/expire` hourly to sweep expired sessions. If you set
   `CRON_SECRET`, Vercel Cron automatically sends it as a Bearer token.

## 10. Testing with a laptop + a phone

1. Deploy (or use `npm run dev -- -H 0.0.0.0` and your laptop's LAN IP so
   your phone can reach it — camera access requires HTTPS or `localhost`,
   so for local network testing over HTTP you'll need something like
   `ngrok`/Vercel preview deploys instead).
2. On the laptop: open the site, click **Create Our Photobooth**, allow
   camera access.
3. Share the guest link (or scan the QR code shown on the "waiting for your
   person" screen) on the phone.
4. On the phone: tap **I'm Ready**, allow camera access.
5. Both screens should flip to "We're ready ❤️". The guest presses the
   shutter button four times; watch both previews go through the
   synchronized 3-2-1-CAPTURE countdown each time.
6. After shot 4, both devices show "Putting our photos together…", then
   "Your photos are ready ❤️" → **View Results** on each device leads
   through the reveal into the same final strip.

## 11. Camera permissions

Camera access requires a secure context (`https://` or `localhost`).
Permission is requested explicitly on `/create` (host) and `/join/[roomId]`
(guest) via `getUserMedia`; denial is handled gracefully with a specific
message and a retry button (see `components/CameraPreview.tsx` and
`lib/camera.ts`) rather than a crash or a silent black box.

## 12. Realtime synchronization design

Two different kinds of "synchronization" are at play, and it's worth being
precise about which is which:

**Session state sync** (who's connected, whose turn, what shot number) uses
Supabase Realtime's `postgres_changes` on the `sessions` row — a normal,
network-latency-bound pub/sub channel. This is fine for state that doesn't
need to happen at a precise instant.

**Capture timing** is different and is the one requirement this app is
built around: the guest pressing the shutter must not simply cause the
server to tell each device "capture now" one after another, because then the
two photos would be separated by whatever the network latency difference is
between the two devices (worse on mobile, easily 50-300ms+).

Instead (see `lib/synchronization.ts` for the implementation, `app/api/
sessions/[roomId]/request-capture/route.ts` for the server side):

1. Each device periodically hits `GET /api/time` a handful of times and
   estimates its clock offset from the server using round-trip timing
   (`offset = serverTime - (t0 + t3) / 2`), keeping the sample with the
   lowest RTT as the most trustworthy estimate — a simplified NTP-style
   estimator.
2. When the guest presses **Capture**, the server does not push a "go"
   message. It stamps a **future** timestamp (`capture_at`, ~1.3s ahead)
   onto the `sessions` row and returns it directly to the guest; the host
   picks up the same timestamp via its Realtime subscription.
3. Both devices independently translate `capture_at` (server time) into
   "how many ms from now" using their own clock offset, and schedule their
   own local capture — `setTimeout` for the coarse approach, then a
   `requestAnimationFrame` busy-poll for the final ~30ms, which reliably
   lands within a frame (~16ms) of the target instant on a foregrounded
   tab.
4. At the scheduled instant, each device independently grabs a frame from
   its own `<video>` element via Canvas and uploads it — the two cameras
   never see each other's stream, and the server never brokers the video
   itself, only the shared timestamp and later, the two resulting still
   images.

**This is not literally hardware-synchronized exposure** — there is no way
to guarantee that in a browser. What it *does* guarantee is that both
devices are told to act at the same shared instant ahead of time and each
independently gets as close to it as browser timer precision allows, rather
than one device's capture being causally downstream of the other's over the
network. That's the practical ceiling for synchronization in a web app, and
it's what "as close to the exact same physical moment as browser technology
allows" means here.

## 13. Session expiration

Sessions default to a 24-hour lifetime (`SESSION_EXPIRY_HOURS`). Expiry is
enforced two ways: lazily, any read of a session (`lib/sessionServer.ts
loadSession`) flips it to `EXPIRED` on the spot if `expires_at` has passed;
and via the hourly Vercel Cron hitting `/api/cron/expire`, which just keeps
stale rows tidy for anyone polling without an active client. Photos
themselves aren't separately deleted by this app (Supabase Storage lifecycle
rules or a scheduled cleanup job would be the next step if you want hard
deletion — this app's guarantee is that an expired room simply refuses to
serve or accept anything further).

## 14. Troubleshooting

- **"This photobooth is already full ❤️"** — a guest token already exists
  for this room from a different browser/device. Only one guest per room is
  ever allowed; if this is the same person on the same device, make sure
  they aren't in a private/incognito tab (which wouldn't have the stored
  token from their first visit).
- **Camera preview stays black / "Couldn't reach the camera"** — check the
  browser actually granted permission (site settings → Camera), and that no
  other app/tab is holding the camera open.
- **Countdown fires but the other device's shot never appears** — check
  both devices show "Connected" via the presence indicator; if one dropped,
  the UI shows a "connection dropped, we'll pick back up" banner and the
  round simply won't advance until both sides upload — nothing is lost,
  just paused.
- **Realtime updates don't arrive** — confirm Realtime is enabled for the
  `sessions` table in Supabase (Database → Replication), and that
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`NEXT_PUBLIC_SUPABASE_URL` are correct.
- **Build fails on Vercel with a Supabase env error** — `lib/supabase.ts`
  throws immediately if the public env vars are missing; double-check
  they're set for the right environment (Production/Preview) in Vercel.
- **"Could not put your photos together" on the host during FINALIZING** —
  `lib/photoComposer.ts` loads the 8 signed photo URLs into an `<img>` with
  `crossOrigin="anonymous"` so they can be drawn to a canvas and exported;
  this requires Supabase Storage to respond with permissive CORS headers,
  which is the default for hosted Supabase projects. If you've customized
  CORS for your Storage bucket, make sure `GET` from your app's origin is
  allowed.

## Limitations

- Capture synchronization is browser-clock-based, not hardware-level; see
  §12 for exactly what guarantee this does and doesn't provide.
- There's no hard deletion of photo files on expiry — only the session
  record's status changes; add a Storage lifecycle policy or a cleanup job
  if you need photos physically removed after expiry.
- Only one Supabase Realtime channel per room is used; extremely
  long-lived idle tabs may need a manual refresh to re-subscribe if the
  browser fully suspends the tab (mobile Safari background tab discarding).
