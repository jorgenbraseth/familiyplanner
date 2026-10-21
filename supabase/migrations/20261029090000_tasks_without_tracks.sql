-- Star tasks no longer belong to a star track: a task is for one child (member_id) or for all
-- children (member_id null) and always applies to the child's current active track.
-- Routine settings keep pointing at a task, which may now be the child's own or an all-children one.
-- Shapes must match src/lib/stars.ts.
--
-- Order matters on production data: the new trigger functions are installed BEFORE the data is
-- converted, so no old rule (task.track_id = star.track_id) can block the conversion, and
-- repointing historical stars never changes their amount.

alter table public.star_tasks add column if not exists member_id uuid references public.members(id) on delete cascade;

-- 1. New rules (replace the old functions; the triggers keep pointing at the function names).

-- The task must apply to the star's child. The amount comes from the task when a star is inserted,
-- or when a signed-in user (not the migration or the service role) changes the task; repointing a
-- historical star as the database owner keeps its amount.
create or replace function public.stars_apply_task()
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
    if not found or (task.member_id is not null and task.member_id is distinct from new.member_id) then
      raise exception 'the task must apply to the star''s child'
        using errcode = 'check_violation';
    end if;
    if tg_op = 'INSERT'
       or (new.task_id is distinct from old.task_id and public.current_member_id() is not null) then
      new.amount := task.stars;
    end if;
  elsif tg_op = 'INSERT' and public.current_member_id() is not null and not public.is_parent() then
    new.amount := 1;
  end if;
  return new;
end $$;

-- Settings belong to a child, and the star task must be the child's own or an all-children task.
create or replace function public.routine_settings_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.members m where m.id = new.member_id and m.role = 'child') then
    raise exception 'routine settings must belong to a child'
      using errcode = 'check_violation';
  end if;
  if new.star_task_id is not null and not exists (
    select 1 from public.star_tasks k
    where k.id = new.star_task_id and (k.member_id is null or k.member_id = new.member_id)
  ) then
    raise exception 'the routine''s star task must be the child''s own or apply to all children'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- A task's member (when set) is a child.
create or replace function public.star_tasks_check_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.member_id is not null
     and not exists (select 1 from public.members m where m.id = new.member_id and m.role = 'child') then
    raise exception 'a star task must belong to a child or to all children'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

revoke execute on function public.stars_apply_task() from public, anon, authenticated;
revoke execute on function public.routine_settings_check() from public, anon, authenticated;
revoke execute on function public.star_tasks_check_member() from public, anon, authenticated;

-- The old policy reads track_id, which is dropped below.
drop policy if exists "star_tasks: child reads own" on public.star_tasks;
drop policy if exists "star_tasks: child reads own or shared" on public.star_tasks;
create policy "star_tasks: child reads own or shared"
  on public.star_tasks for select to authenticated
  using (public.current_member_id() is not null and (member_id is null or member_id = public.current_member_id()));

-- 2. Convert the data (only while star_tasks still has track_id).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'star_tasks' and column_name = 'track_id'
  ) then
    return;
  end if;

  update public.star_tasks k
    set member_id = t.member_id
    from public.star_tracks t
    where t.id = k.track_id and k.member_id is null;

  -- A child may have the same task name on several tracks (finished tracks): keep one row per
  -- (member, name), preferring the one on the active track, else the newest.
  create temp table task_keep on commit drop as
  select k.id, k.member_id, k.name,
         first_value(k.id) over (
           partition by k.member_id, k.name
           order by (t.status = 'active') desc, k.created_at desc, k.id
         ) as keep_id
  from public.star_tasks k
  join public.star_tracks t on t.id = k.track_id;

  update public.stars s set task_id = d.keep_id
    from task_keep d where s.task_id = d.id and d.id <> d.keep_id;
  update public.routine_settings r set star_task_id = d.keep_id
    from task_keep d where r.star_task_id = d.id and d.id <> d.keep_id;
  delete from public.star_tasks k
    using task_keep d where k.id = d.id and d.id <> d.keep_id;

  -- Dropping the column also drops unique (track_id, name) and star_tasks_track_idx.
  alter table public.star_tasks drop column track_id;
end $$;

-- The preset-reason conversion of an earlier migration is done and refers to track_id.
drop function if exists public.star_tasks_from_presets();

-- 3. Constraints, indexes, trigger.
alter table public.star_tasks drop constraint if exists star_tasks_member_name_key;
alter table public.star_tasks add constraint star_tasks_member_name_key unique nulls not distinct (member_id, name);
create index if not exists star_tasks_member_idx on public.star_tasks (member_id);

drop trigger if exists star_tasks_member_is_child on public.star_tasks;
create trigger star_tasks_member_is_child
  before insert or update of member_id on public.star_tasks
  for each row execute function public.star_tasks_check_member();

comment on column public.star_tasks.member_id is
  'The child the task is for; null means it applies to all children. Tasks always apply to the child''s active track.';
