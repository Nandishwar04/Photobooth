-- Fixes a check-then-act race in shot-completion detection.
--
-- The upload-photo route used to SELECT the session row, decide in
-- application code whether "the other participant already uploaded",
-- then UPDATE. Because synchronized capture makes both participants'
-- uploads arrive within milliseconds of each other by design, both
-- requests could read the pre-update row (seeing the other side's flag
-- as still false), each conclude "I'm first", and each only flip its
-- own flag — leaving both flags true but the session never advancing.
--
-- The fix moves flag-set + completion-check + advancement into a single
-- UPDATE statement. Postgres takes a row lock for the duration of an
-- UPDATE, so if two requests hit this function concurrently for the
-- same session row, the second one is blocked until the first commits,
-- and then evaluates the CASE expressions against the FIRST request's
-- already-committed values — making "did the other side finish" check
-- correct regardless of arrival order or timing.

create or replace function advance_shot_on_upload(
  p_session_id uuid,
  p_role text,
  p_capture_seq int
)
returns sessions
language plpgsql
as $$
declare
  result sessions;
  host_done boolean;
  guest_done boolean;
begin
  if p_role not in ('HOST', 'GUEST') then
    raise exception 'invalid role: %', p_role;
  end if;

  -- Single atomic UPDATE: every expression on the right-hand side of SET
  -- refers to the row's values as they were before this statement ran
  -- (standard SQL UPDATE semantics), so host_done/guest_done below are
  -- computed consistently within one statement rather than via a
  -- separate read that could go stale.
  update sessions s
  set
    host_shot_uploaded = case when p_role = 'HOST' then true else s.host_shot_uploaded end,
    guest_shot_uploaded = case when p_role = 'GUEST' then true else s.guest_shot_uploaded end,
    status = case
      when (case when p_role = 'HOST' then true else s.host_shot_uploaded end)
       and (case when p_role = 'GUEST' then true else s.guest_shot_uploaded end)
      then case when s.current_shot >= s.total_shots then 'FINALIZING' else 'READY' end
      else s.status
    end,
    current_shot = case
      when (case when p_role = 'HOST' then true else s.host_shot_uploaded end)
       and (case when p_role = 'GUEST' then true else s.guest_shot_uploaded end)
       and s.current_shot < s.total_shots
      then s.current_shot + 1
      else s.current_shot
    end,
    capture_at = case
      when (case when p_role = 'HOST' then true else s.host_shot_uploaded end)
       and (case when p_role = 'GUEST' then true else s.guest_shot_uploaded end)
      then null
      else s.capture_at
    end
  where s.id = p_session_id
    and s.capture_seq = p_capture_seq
  returning s.* into result;

  if result.id is null then
    -- No row matched (capture_seq moved on under us) — nothing to do,
    -- caller treats this as "round already advanced elsewhere".
    return result;
  end if;

  host_done := result.host_shot_uploaded;
  guest_done := result.guest_shot_uploaded;

  -- If this call just completed the pair (status now READY/FINALIZING),
  -- reset the uploaded flags for the round that's starting/finalizing.
  -- Done as a follow-up statement because we needed the pre-reset
  -- values above to correctly detect completion first.
  if host_done and guest_done and result.status in ('READY', 'FINALIZING') then
    update sessions
    set host_shot_uploaded = false, guest_shot_uploaded = false
    where id = p_session_id
    returning * into result;
  end if;

  return result;
end;
$$;

-- Service-role only (matches every other write path in this app); no
-- grants to anon/authenticated needed since Route Handlers call this
-- via the admin client.
