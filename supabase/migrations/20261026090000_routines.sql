-- Morning/evening routines ("Morgenstell" / "Kveldstell"): per-child checklists, an optional star task
-- the child may request once per slot per day when everything is checked, and the checks themselves.
-- Shapes must match src/lib/routines.ts.

-- Today's date in the family's time zone.
create function public.routine_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Europe/Copenhagen')::date $$;

create table public.routine_items (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  slot text not null check (slot in ('morning', 'evening')),
  name text not null check (length(name) between 1 and 60),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (member_id, slot, name)
);

create index routine_items_member_slot_idx on public.routine_items (member_id, slot);

create table public.routine_settings (
  member_id uuid not null references public.members(id) on delete cascade,
  slot text not null check (slot in ('morning', 'evening')),
  star_task_id uuid references public.star_tasks(id) on delete set null,
  primary key (member_id, slot)
);

create table public.routine_checks (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.routine_items(id) on delete cascade,
  member_id uuid not null,
  date date not null,
  checked_at timestamptz not null default now(),
  unique (item_id, date)
);

create index routine_checks_member_date_idx on public.routine_checks (member_id, date);

alter table public.routine_items enable row level security;
alter table public.routine_settings enable row level security;
alter table public.routine_checks enable row level security;

-- Stars may come from a routine: at most one request per child per slot per day.
alter table public.stars
  add column routine_slot text check (routine_slot in ('morning', 'evening')),
  add column routine_date date,
  add constraint stars_routine_both_or_none check ((routine_slot is null) = (routine_date is null));

create unique index stars_one_routine_request_per_day
  on public.stars (member_id, routine_slot, routine_date) where routine_slot is not null;

-- Triggers (security definer so lookups aren't filtered by the caller's RLS).

-- An item belongs to a child, and a child has at most 15 items per slot.
create function public.routine_items_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.members m where m.id = new.member_id and m.role = 'child') then
    raise exception 'a routine item must belong to a child'
      using errcode = 'check_violation';
  end if;
  if (select count(*) from public.routine_items i
      where i.member_id = new.member_id and i.slot = new.slot and i.id <> new.id) >= 15 then
    raise exception 'at most 15 routine items per child and slot'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger routine_items_check
  before insert or update of member_id, slot on public.routine_items
  for each row execute function public.routine_items_check();

-- Settings belong to a child, and the star task must be on one of that child's tracks.
create function public.routine_settings_check()
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
    join public.star_tracks t on t.id = k.track_id
    where k.id = new.star_task_id and t.member_id = new.member_id
  ) then
    raise exception 'the routine''s star task must belong to one of the child''s tracks'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger routine_settings_check
  before insert or update of member_id, star_task_id on public.routine_settings
  for each row execute function public.routine_settings_check();

-- routine_checks.member_id must equal the item's member_id.
create function public.routine_checks_check_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.member_id is distinct from (select i.member_id from public.routine_items i where i.id = new.item_id) then
    raise exception 'routine_checks.member_id must match the item''s member_id'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger routine_checks_member_matches_item
  before insert or update of member_id, item_id on public.routine_checks
  for each row execute function public.routine_checks_check_member();

-- A child may only mark a star request as a routine request when the routine is complete today
-- (and, if the parent picked a star task for the slot, only with that task). Parents and the
-- service role are not restricted.
create function public.stars_check_routine()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.routine_slot is null or public.current_member_id() is null or public.is_parent() then
    return new;
  end if;
  if new.routine_date is distinct from public.routine_today() then
    raise exception 'routine_not_complete' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.routine_items i where i.member_id = new.member_id and i.slot = new.routine_slot)
     or exists (
       select 1 from public.routine_items i
       where i.member_id = new.member_id and i.slot = new.routine_slot
         and not exists (select 1 from public.routine_checks c where c.item_id = i.id and c.date = new.routine_date)
     ) then
    raise exception 'routine_not_complete' using errcode = 'check_violation';
  end if;
  if new.task_id is distinct from (
    select s.star_task_id from public.routine_settings s
    where s.member_id = new.member_id and s.slot = new.routine_slot
  ) then
    raise exception 'the star task must be the routine''s star task' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger stars_check_routine
  before insert on public.stars
  for each row execute function public.stars_check_routine();

revoke execute on function public.routine_items_check() from public, anon, authenticated;
revoke execute on function public.routine_settings_check() from public, anon, authenticated;
revoke execute on function public.routine_checks_check_member() from public, anon, authenticated;
revoke execute on function public.stars_check_routine() from public, anon, authenticated;

-- routine_items
create policy "routine_items: parents all"
  on public.routine_items for all to authenticated
  using (public.is_parent())
  with check (public.is_parent());

create policy "routine_items: child reads own"
  on public.routine_items for select to authenticated
  using (member_id = public.current_member_id());

-- routine_settings
create policy "routine_settings: parents all"
  on public.routine_settings for all to authenticated
  using (public.is_parent())
  with check (public.is_parent());

create policy "routine_settings: child reads own"
  on public.routine_settings for select to authenticated
  using (member_id = public.current_member_id());

-- routine_checks: children check and uncheck their own items, today only; no updates.
create policy "routine_checks: parents all"
  on public.routine_checks for all to authenticated
  using (public.is_parent())
  with check (public.is_parent());

create policy "routine_checks: child reads own"
  on public.routine_checks for select to authenticated
  using (member_id = public.current_member_id());

create policy "routine_checks: child checks own today"
  on public.routine_checks for insert to authenticated
  with check (member_id = public.current_member_id() and date = public.routine_today());

create policy "routine_checks: child unchecks own today"
  on public.routine_checks for delete to authenticated
  using (member_id = public.current_member_id() and date = public.routine_today());

revoke all on public.routine_items from anon;
revoke all on public.routine_settings from anon;
revoke all on public.routine_checks from anon;
