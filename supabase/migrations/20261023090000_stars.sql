-- Star tracks, stars (requests + approvals), rewards, and web-push subscriptions.
-- Shapes must match src/lib/stars.ts.

-- How many star requests a child may make per day (Europe/Copenhagen). Keep in sync with
-- STAR_DAILY_LIMIT in src/lib/stars.ts; change it with a new migration that replaces this function.
create function public.star_request_daily_limit()
returns int
language sql
immutable
as $$ select 5 $$;

-- Every preset reason is 1..60 characters, at most 20 of them (CHECK can't use a subquery).
create function public.valid_preset_reasons(reasons text[])
returns boolean
language sql
immutable
as $$
  select reasons is not null
    and cardinality(reasons) <= 20
    and not exists (select 1 from unnest(reasons) r where r is null or length(r) not between 1 and 60)
$$;

create table public.star_tracks (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  goal int not null default 30 check (goal between 5 and 200),
  milestone_every int not null default 5 check (milestone_every between 1 and 50),
  small_reward text not null default '' check (length(small_reward) <= 200),
  big_reward text not null default '' check (length(big_reward) <= 200),
  preset_reasons text[] not null default '{}' check (public.valid_preset_reasons(preset_reasons)),
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint star_tracks_every_divides_goal check (goal % milestone_every = 0)
);

-- One active track per child; completed tracks stay as history.
create unique index star_tracks_one_active_per_member
  on public.star_tracks (member_id) where status = 'active';

create table public.stars (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.star_tracks(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  reason text not null check (length(reason) between 1 and 120),
  photo_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  requested_by uuid references public.members(id) on delete set null,
  decided_by uuid references public.members(id) on delete set null,
  decided_at timestamptz,
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now()
);

create index stars_track_status_idx on public.stars (track_id, status);
create index stars_member_created_idx on public.stars (member_id, created_at);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.star_tracks(id) on delete cascade,
  at_count int not null,
  kind text not null check (kind in ('small', 'big')),
  given_at timestamptz not null default now(),
  given_by uuid references public.members(id) on delete set null,
  unique (track_id, at_count)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null check (
    coalesce(jsonb_typeof(keys -> 'p256dh'), '') = 'string'
    and coalesce(jsonb_typeof(keys -> 'auth'), '') = 'string'
  ),
  created_at timestamptz not null default now()
);

create index push_subscriptions_member_idx on public.push_subscriptions (member_id);

alter table public.star_tracks enable row level security;
alter table public.stars enable row level security;
alter table public.rewards enable row level security;
alter table public.push_subscriptions enable row level security;

-- Triggers (security definer so lookups aren't filtered by the caller's RLS).

-- A track belongs to a child.
create function public.star_tracks_check_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.members m where m.id = new.member_id and m.role = 'child') then
    raise exception 'a star track must belong to a child'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger star_tracks_member_is_child
  before insert or update of member_id on public.star_tracks
  for each row execute function public.star_tracks_check_child();

-- stars.member_id must equal its track's member_id.
create function public.stars_check_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.member_id is distinct from (select t.member_id from public.star_tracks t where t.id = new.track_id) then
    raise exception 'stars.member_id must match the track''s member_id'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger stars_member_matches_track
  before insert or update of member_id, track_id on public.stars
  for each row execute function public.stars_check_member();

-- Daily request limit for non-parents, counted in Europe/Copenhagen days.
create function public.stars_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
  day_start timestamptz := date_trunc('day', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen';
  n int;
begin
  if me is null or public.is_parent() then
    return new;
  end if;
  select count(*) into n from public.stars s where s.requested_by = me and s.created_at >= day_start;
  if n >= public.star_request_daily_limit() then
    raise exception 'star_daily_limit' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger stars_daily_limit
  before insert on public.stars
  for each row execute function public.stars_daily_limit();

-- Deciding a star records who and when; going back to pending clears it.
create function public.stars_fill_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    if tg_op = 'INSERT' or old.status <> 'pending' then
      new.decided_by := null;
      new.decided_at := null;
    end if;
  elsif tg_op = 'INSERT' then
    new.decided_by := coalesce(new.decided_by, public.current_member_id());
    new.decided_at := coalesce(new.decided_at, now());
  elsif new.status is distinct from old.status then
    -- A re-decision replaces the earlier one unless the caller set the fields explicitly.
    if new.decided_by is not distinct from old.decided_by then
      new.decided_by := public.current_member_id();
    end if;
    if new.decided_at is not distinct from old.decided_at then
      new.decided_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger stars_fill_decision
  before insert or update on public.stars
  for each row execute function public.stars_fill_decision();

-- A reward is at a milestone, 'big' exactly at the goal, and only once enough stars are approved.
create function public.rewards_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.star_tracks;
  approved int;
begin
  select * into t from public.star_tracks where id = new.track_id;
  if new.at_count <= 0 or new.at_count > t.goal or new.at_count % t.milestone_every <> 0 then
    raise exception 'reward at_count must be a positive multiple of the milestone interval, up to the goal'
      using errcode = 'check_violation';
  end if;
  if (new.kind = 'big') is distinct from (new.at_count = t.goal) then
    raise exception 'reward kind must be big exactly at the goal'
      using errcode = 'check_violation';
  end if;
  select count(*) into approved from public.stars s where s.track_id = new.track_id and s.status = 'approved';
  if approved < new.at_count then
    raise exception 'only % stars approved, reward at % not reached', approved, new.at_count
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger rewards_check
  before insert or update of track_id, at_count, kind on public.rewards
  for each row execute function public.rewards_check();

revoke execute on function public.star_tracks_check_child() from public, anon, authenticated;
revoke execute on function public.stars_check_member() from public, anon, authenticated;
revoke execute on function public.stars_daily_limit() from public, anon, authenticated;
revoke execute on function public.stars_fill_decision() from public, anon, authenticated;
revoke execute on function public.rewards_check() from public, anon, authenticated;

-- star_tracks
create policy "star_tracks: parents all"
  on public.star_tracks for all to authenticated
  using (public.is_parent())
  with check (public.is_parent());

create policy "star_tracks: child reads own"
  on public.star_tracks for select to authenticated
  using (member_id = public.current_member_id());

-- stars
create policy "stars: parents all"
  on public.stars for all to authenticated
  using (public.is_parent())
  with check (public.is_parent());

create policy "stars: child reads own"
  on public.stars for select to authenticated
  using (member_id = public.current_member_id());

create policy "stars: child requests on own active track"
  on public.stars for insert to authenticated
  with check (
    member_id = public.current_member_id()
    and requested_by = public.current_member_id()
    and status = 'pending'
    and decided_by is null
    and decided_at is null
    and note is null
    and exists (
      select 1 from public.star_tracks t
      where t.id = track_id and t.member_id = public.current_member_id() and t.status = 'active'
    )
  );

-- rewards
create policy "rewards: parents all"
  on public.rewards for all to authenticated
  using (public.is_parent())
  with check (public.is_parent());

create policy "rewards: child reads own"
  on public.rewards for select to authenticated
  using (exists (
    select 1 from public.star_tracks t
    where t.id = track_id and t.member_id = public.current_member_id()
  ));

-- push_subscriptions: own rows only; update is needed for the upsert on endpoint (the server sends pushes with the service-role client).
create policy "push_subscriptions: read own"
  on public.push_subscriptions for select to authenticated
  using (member_id = public.current_member_id());

create policy "push_subscriptions: insert own"
  on public.push_subscriptions for insert to authenticated
  with check (member_id = public.current_member_id());

create policy "push_subscriptions: delete own"
  on public.push_subscriptions for delete to authenticated
  using (member_id = public.current_member_id());

create policy "push_subscriptions: update own"
  on public.push_subscriptions for update to authenticated
  using (member_id = public.current_member_id())
  with check (member_id = public.current_member_id());

revoke all on public.star_tracks from anon;
revoke all on public.stars from anon;
revoke all on public.rewards from anon;
revoke all on public.push_subscriptions from anon;
