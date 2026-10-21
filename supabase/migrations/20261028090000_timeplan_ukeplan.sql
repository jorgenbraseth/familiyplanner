-- Two document types: `timeplan` (a child's fixed weekly timetable, becomes the school-day
-- configuration when published) and `ukeplan` (the weekly plan: homework, events, messages).
-- Plan items get an audience (children never see parent-only items) and a whole-week flag.
-- Shapes must match src/lib/plan.ts.

-- The "children change only done" trigger must not block migrations or the service role: those
-- run without a signed-in member (no JWT, so is_parent() is false). Enforce it only for a
-- signed-in non-parent member. (Same signature and attributes as in 20261022090000_documents.sql.)
create or replace function public.plan_items_children_done_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_member_id() is not null
     and not public.is_parent()
     and (to_jsonb(new) - 'done') is distinct from (to_jsonb(old) - 'done') then
    raise exception 'only "done" can be changed on a plan item'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

revoke execute on function public.plan_items_children_done_only() from public, anon, authenticated;

-- Documents: only two types. Old rows become ukeplan before the new check goes on.
alter table public.documents drop constraint if exists documents_type_check;

update public.documents set type = 'ukeplan' where type in ('week_schedule', 'homework', 'other');

alter table public.documents
  add constraint documents_type_check check (type in ('timeplan', 'ukeplan'));

-- A timeplan has no ISO week; a ukeplan needs one.
alter table public.documents drop constraint if exists documents_iso_week_check;
alter table public.documents drop constraint if exists documents_iso_year_check;
alter table public.documents drop constraint if exists documents_week_by_type_check;

alter table public.documents
  alter column iso_week drop not null,
  alter column iso_year drop not null;

alter table public.documents
  add constraint documents_iso_week_check check (iso_week is null or iso_week between 1 and 53),
  add constraint documents_iso_year_check check (iso_year is null or iso_year between 2000 and 2100),
  add constraint documents_week_by_type_check check (
    (type = 'ukeplan' and iso_week is not null and iso_year is not null)
    or (type = 'timeplan' and iso_week is null and iso_year is null)
  );

-- Plan items: kinds homework/event/message ('lesson' stays only for old rows).
alter table public.plan_items drop constraint if exists plan_items_kind_check;

alter table public.plan_items
  add column if not exists audience text not null default 'both' check (audience in ('child', 'parent', 'both')),
  add column if not exists whole_week boolean not null default false;

-- 'bring' (things to pack) was for the child; 'note' was for everyone.
update public.plan_items set kind = 'message', audience = 'child' where kind = 'bring';
update public.plan_items set kind = 'message', audience = 'both' where kind = 'note';

alter table public.plan_items
  add constraint plan_items_kind_check check (kind in ('homework', 'event', 'message', 'lesson'));

comment on column public.plan_items.whole_week is
  'Week-level homework/messages: date is the Monday of the document''s week.';
comment on column public.plan_items.starts_at is
  'Lessons (legacy) and events: optional start time.';

-- Children only see and tick off items meant for them.
drop policy if exists "plan_items: child reads own published" on public.plan_items;
drop policy if exists "plan_items: child marks own done" on public.plan_items;

create policy "plan_items: child reads own published"
  on public.plan_items for select to authenticated
  using (
    member_id = public.current_member_id()
    and audience <> 'parent'
    and exists (select 1 from public.documents d where d.id = document_id and d.status = 'published')
  );

create policy "plan_items: child marks own done"
  on public.plan_items for update to authenticated
  using (
    member_id = public.current_member_id()
    and audience <> 'parent'
    and exists (select 1 from public.documents d where d.id = document_id and d.status = 'published')
  )
  with check (member_id = public.current_member_id() and audience <> 'parent');

-- Timetable from a timeplan document: school start/end per weekday, and the periods.
create table if not exists public.timetable_days (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  weekday int not null check (weekday between 1 and 7),
  starts_at time,
  ends_at time,
  unique (document_id, weekday)
);

create index if not exists timetable_days_member_idx on public.timetable_days (member_id, weekday);

create table if not exists public.timetable_periods (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  weekday int not null check (weekday between 1 and 7),
  period int check (period between 1 and 15),
  starts_at time,
  ends_at time,
  subject text not null check (length(subject) between 1 and 100),
  sort int not null default 0
);

create index if not exists timetable_periods_member_idx on public.timetable_periods (member_id, weekday);
create index if not exists timetable_periods_document_idx on public.timetable_periods (document_id);

alter table public.timetable_days enable row level security;
alter table public.timetable_periods enable row level security;

-- member_id must equal the document's member_id (same rule as plan_items).
create or replace function public.timetable_check_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.member_id is distinct from (select d.member_id from public.documents d where d.id = new.document_id) then
    raise exception '%.member_id must match the document''s member_id', tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists timetable_days_member_matches_document on public.timetable_days;
create trigger timetable_days_member_matches_document
  before insert or update of member_id, document_id on public.timetable_days
  for each row execute function public.timetable_check_member();

drop trigger if exists timetable_periods_member_matches_document on public.timetable_periods;
create trigger timetable_periods_member_matches_document
  before insert or update of member_id, document_id on public.timetable_periods
  for each row execute function public.timetable_check_member();

revoke execute on function public.timetable_check_member() from public, anon, authenticated;

drop policy if exists "timetable_days: parents all" on public.timetable_days;
create policy "timetable_days: parents all"
  on public.timetable_days for all to authenticated
  using (public.is_parent())
  with check (public.is_parent());

drop policy if exists "timetable_days: child reads own published" on public.timetable_days;
create policy "timetable_days: child reads own published"
  on public.timetable_days for select to authenticated
  using (
    member_id = public.current_member_id()
    and exists (select 1 from public.documents d where d.id = document_id and d.status = 'published')
  );

drop policy if exists "timetable_periods: parents all" on public.timetable_periods;
create policy "timetable_periods: parents all"
  on public.timetable_periods for all to authenticated
  using (public.is_parent())
  with check (public.is_parent());

drop policy if exists "timetable_periods: child reads own published" on public.timetable_periods;
create policy "timetable_periods: child reads own published"
  on public.timetable_periods for select to authenticated
  using (
    member_id = public.current_member_id()
    and exists (select 1 from public.documents d where d.id = document_id and d.status = 'published')
  );

revoke all on public.timetable_days from anon;
revoke all on public.timetable_periods from anon;

-- The member's active timetable: their latest published timeplan. security invoker, so RLS applies
-- (a child gets their own; parents any member's).
create or replace function public.active_timeplan_document(member uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select d.id
  from public.documents d
  where d.member_id = member and d.type = 'timeplan' and d.status = 'published'
  order by d.created_at desc, d.id desc
  limit 1
$$;

revoke execute on function public.active_timeplan_document(uuid) from public, anon;
grant execute on function public.active_timeplan_document(uuid) to authenticated;
