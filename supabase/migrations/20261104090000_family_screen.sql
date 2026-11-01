-- Familieskjerm: a shared family tablet. There are NO screen accounts: a PARENT signs in on the
-- tablet choosing "Logg inn som familieskjerm", and that one auth session is recorded in
-- screen_sessions (Supabase access tokens carry a `session_id` claim that survives token
-- refreshes). From then on the database treats the session as the screen: is_parent() is false and
-- is_screen() is true for it, so every existing policy and trigger gives it exactly the screen
-- rights below and none of the parent's. The same parent's other sessions (their phone) are
-- unaffected. current_member_id() is unchanged (still the parent), so a star requested from the
-- screen has requested_by = that parent but is pending like any child request.
--
-- The screen can do what a child does for ANY child (request a pending star, tick routine items
-- today, tick homework done) and nothing else; stars it creates are always pending (a parent
-- approves on another device). It reads through the family-wide read policies
-- (current_member_id() is not null).
--
-- Every other policy/trigger in the migrations goes through is_parent() (the only place that
-- compared members.role = 'parent' directly was is_parent() itself, replaced below); the
-- `role = 'child'` checks look at the star/routine owner, not the caller, and are unaffected.
-- There is deliberately no way to leave screen mode for a session: leaving = signing out.

-- The auth session id of the current JWT, or null (no claim, not a uuid, no JWT at all).
create or replace function public.current_session_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(auth.jwt() ->> 'session_id', '')::uuid;
exception when others then
  return null;
end $$;

revoke execute on function public.current_session_id() from public, anon;
grant execute on function public.current_session_id() to authenticated;

create table if not exists public.screen_sessions (
  session_id uuid primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.screen_sessions enable row level security;
revoke all on public.screen_sessions from anon, authenticated;
grant select on public.screen_sessions to authenticated;

drop policy if exists "screen_sessions: read own" on public.screen_sessions;
create policy "screen_sessions: read own"
  on public.screen_sessions for select to authenticated
  using (member_id = public.current_member_id());

-- True when the current auth session was put into screen mode. Security definer so the lookup is
-- not filtered by the caller's RLS.
create or replace function public.current_session_is_screen()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.screen_sessions s where s.session_id = public.current_session_id()
  )
$$;

revoke execute on function public.current_session_is_screen() from public, anon;
grant execute on function public.current_session_is_screen() to authenticated;

-- Puts the current auth session into screen mode. Parents only (role column checked directly);
-- idempotent; no way back.
create or replace function public.enter_screen_mode()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid;
  sid uuid := public.current_session_id();
begin
  select m.id into me from public.members m where m.email = lower(auth.email()) and m.role = 'parent';
  if me is null then
    raise exception 'only a parent can sign in as family screen' using errcode = '42501';
  end if;
  if sid is null then
    raise exception 'no session' using errcode = '42501';
  end if;
  insert into public.screen_sessions (session_id, member_id) values (sid, me) on conflict do nothing;
end $$;

revoke execute on function public.enter_screen_mode() from public, anon;
grant execute on function public.enter_screen_mode() to authenticated;

-- is_parent(): a parent in a NORMAL session. is_screen(): a parent in a screen session.
create or replace function public.is_parent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members where email = lower(auth.email()) and role = 'parent'
  ) and not public.current_session_is_screen()
$$;

create or replace function public.is_screen()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members where email = lower(auth.email()) and role = 'parent'
  ) and public.current_session_is_screen()
$$;

revoke execute on function public.is_screen() from public, anon;
grant execute on function public.is_screen() to authenticated;

-- Device lock: a tablet that was signed in as screen is "locked" (the app remembers the device id
-- in a cookie), so signing out and back in there gives the screen again, never the parent's normal
-- session. A parent frees it from their own phone (a screen session cannot release).
create table if not exists public.screen_devices (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references public.members (id) on delete set null
);

alter table public.screen_devices enable row level security;
revoke all on public.screen_devices from anon, authenticated;
grant select on public.screen_devices to authenticated;
grant update (released_at, released_by) on public.screen_devices to authenticated;

drop policy if exists "screen_devices: parents read" on public.screen_devices;
create policy "screen_devices: parents read"
  on public.screen_devices for select to authenticated
  using (public.is_parent());

drop policy if exists "screen_devices: parents release" on public.screen_devices;
create policy "screen_devices: parents release"
  on public.screen_devices for update to authenticated
  using (public.is_parent() and released_at is null)
  with check (public.is_parent());

-- A release is final and always records who and when.
create or replace function public.screen_devices_release()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.released_at is not null then
    raise exception 'screen device already released' using errcode = 'check_violation';
  end if;
  new.released_at := now();
  new.released_by := public.current_member_id();
  return new;
end $$;

drop trigger if exists screen_devices_release on public.screen_devices;
create trigger screen_devices_release
  before update on public.screen_devices
  for each row execute function public.screen_devices_release();

revoke execute on function public.screen_devices_release() from public, anon, authenticated;

-- Creates a device row; only a screen session may.
create or replace function public.register_screen_device()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not public.is_screen() then
    raise exception 'only the family screen can register a device' using errcode = '42501';
  end if;
  insert into public.screen_devices (created_by) values (public.current_member_id()) returning id into new_id;
  return new_id;
end $$;

revoke execute on function public.register_screen_device() from public, anon;
grant execute on function public.register_screen_device() to authenticated;

-- True when the device exists and has not been released. Callable before sign-in (the login page);
-- it reveals nothing else.
create or replace function public.screen_device_locked(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.screen_devices d where d.id = p_id and d.released_at is null)
$$;

revoke execute on function public.screen_device_locked(uuid) from public;
grant execute on function public.screen_device_locked(uuid) to anon, authenticated;

-- True when the member is a child (security definer: the lookup is not filtered by the caller's RLS).
create or replace function public.is_child_member(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.members m where m.id = p_member_id and m.role = 'child')
$$;

revoke execute on function public.is_child_member(uuid) from public, anon;
grant execute on function public.is_child_member(uuid) to authenticated;

-- stars: the screen requests for any child, always pending, on that child's active track.
-- requested_by is the signed-in parent (honest audit trail). The triggers still apply, because
-- is_parent() is false in a screen session: stars_apply_task sets the amount (1 without a task),
-- stars_check_routine requires a complete routine today with the routine's own star task,
-- stars_fill_decision clears decided_by/decided_at for pending rows.
drop policy if exists "stars: screen requests for a child" on public.stars;
create policy "stars: screen requests for a child"
  on public.stars for insert to authenticated
  with check (
    public.is_screen()
    and public.is_child_member(member_id)
    and requested_by = public.current_member_id()
    and status = 'pending'
    and decided_by is null
    and decided_at is null
    and note is null
    and exists (
      select 1 from public.star_tracks t
      where t.id = track_id and t.member_id = stars.member_id and t.status = 'active'
    )
  );

-- routine_checks: check and uncheck any child's items, today only.
drop policy if exists "routine_checks: screen checks today" on public.routine_checks;
create policy "routine_checks: screen checks today"
  on public.routine_checks for insert to authenticated
  with check (public.is_screen() and public.is_child_member(member_id) and date = public.routine_today());

drop policy if exists "routine_checks: screen unchecks today" on public.routine_checks;
create policy "routine_checks: screen unchecks today"
  on public.routine_checks for delete to authenticated
  using (public.is_screen() and public.is_child_member(member_id) and date = public.routine_today());

-- plan_items: tick a child's published, non-parent item done. The plan_items_children_done_only
-- trigger restricts every signed-in non-parent (the screen included) to changing `done`.
drop policy if exists "plan_items: screen marks done" on public.plan_items;
create policy "plan_items: screen marks done"
  on public.plan_items for update to authenticated
  using (
    public.is_screen()
    and public.is_child_member(member_id)
    and audience <> 'parent'
    and exists (select 1 from public.documents d where d.id = document_id and d.status = 'published')
  )
  with check (public.is_screen() and public.is_child_member(member_id) and audience <> 'parent');
