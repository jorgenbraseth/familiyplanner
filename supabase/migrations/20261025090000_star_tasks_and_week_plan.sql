-- Star tasks (parent-defined things a child can request stars for, worth 1..10 stars each),
-- star amounts, and week plan structure (lesson periods/times, school start/end per day).
-- Shapes must match src/lib/stars.ts.

-- Star tasks
create table public.star_tasks (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.star_tracks(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  stars int not null check (stars between 1 and 10),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (track_id, name)
);

create index star_tasks_track_idx on public.star_tasks (track_id);

alter table public.star_tasks enable row level security;

create policy "star_tasks: parents all"
  on public.star_tasks for all to authenticated
  using (public.is_parent())
  with check (public.is_parent());

create policy "star_tasks: child reads own"
  on public.star_tasks for select to authenticated
  using (exists (
    select 1 from public.star_tracks t
    where t.id = track_id and t.member_id = public.current_member_id()
  ));

revoke all on public.star_tasks from anon;

-- Stars carry an amount, optionally from a task.
alter table public.stars
  add column amount int not null default 1 check (amount between 1 and 10),
  add column task_id uuid references public.star_tasks(id) on delete set null;

-- A task must belong to the star's track and decides the amount. Without a task, a non-parent
-- always gets 1; parents (and the service role) may set 1..10 directly.
-- Named to fire before the other stars triggers (alphabetical order).
create function public.stars_apply_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task public.star_tasks;
begin
  if new.task_id is not null then
    select * into task from public.star_tasks k where k.id = new.task_id;
    if not found or task.track_id is distinct from new.track_id then
      raise exception 'the task must belong to the star''s track'
        using errcode = 'check_violation';
    end if;
    if tg_op = 'INSERT' or new.task_id is distinct from old.task_id then
      new.amount := task.stars;
    end if;
  elsif tg_op = 'INSERT' and public.current_member_id() is not null and not public.is_parent() then
    new.amount := 1;
  end if;
  return new;
end $$;

create trigger stars_a_apply_task
  before insert or update of task_id, track_id on public.stars
  for each row execute function public.stars_apply_task();

revoke execute on function public.stars_apply_task() from public, anon, authenticated;

-- Progress is the sum of approved amounts, not the number of rows.
create or replace function public.rewards_check()
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
  select coalesce(sum(s.amount), 0) into approved
    from public.stars s where s.track_id = new.track_id and s.status = 'approved';
  if approved < new.at_count then
    raise exception 'only % stars approved, reward at % not reached', approved, new.at_count
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Existing preset reasons become 1-star tasks (factored out so it can be tested).
create function public.star_tasks_from_presets()
returns void
language sql
as $$
  insert into public.star_tasks (track_id, name, stars, sort)
  select t.id, r.reason, 1, (r.ord - 1)::int
  from public.star_tracks t, unnest(t.preset_reasons) with ordinality as r(reason, ord)
  on conflict do nothing
$$;

revoke execute on function public.star_tasks_from_presets() from public, anon, authenticated;

do $$ begin perform public.star_tasks_from_presets(); end $$;

comment on column public.star_tracks.preset_reasons is
  'Unused since star_tasks (migration 20261025090000); kept only for old data.';

-- Week plan structure
alter table public.plan_items
  add column period int check (period between 1 and 15),
  add column starts_at time,
  add column ends_at time;

create table public.school_days (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  date date not null,
  starts_at time,
  ends_at time,
  unique (document_id, date)
);

create index school_days_member_date_idx on public.school_days (member_id, date);

alter table public.school_days enable row level security;

create function public.school_days_check_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.member_id is distinct from (select d.member_id from public.documents d where d.id = new.document_id) then
    raise exception 'school_days.member_id must match the document''s member_id'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger school_days_member_matches_document
  before insert or update of member_id, document_id on public.school_days
  for each row execute function public.school_days_check_member();

revoke execute on function public.school_days_check_member() from public, anon, authenticated;

create policy "school_days: parents all"
  on public.school_days for all to authenticated
  using (public.is_parent())
  with check (public.is_parent());

create policy "school_days: child reads own published"
  on public.school_days for select to authenticated
  using (
    member_id = public.current_member_id()
    and exists (select 1 from public.documents d where d.id = document_id and d.status = 'published')
  );

revoke all on public.school_days from anon;
