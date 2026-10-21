-- A member can have several Google calendars (e.g. one per kid plus a shared "both kids" calendar).
alter table public.members
  add column calendar_ids text[] not null default '{}';

update public.members
  set calendar_ids = array[trim(calendar_id)]
  where calendar_id is not null and trim(calendar_id) <> '';

-- Check constraints can't hold subqueries, so the per-entry rule lives in a small immutable function.
create function public.valid_calendar_ids(ids text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select ids is not null
    and cardinality(ids) <= 10
    and not exists (
      select 1 from unnest(ids) as c
      where c is null or length(c) not between 1 and 200 or c <> trim(c)
    )
$$;

alter table public.members
  add constraint members_calendar_ids_valid check (public.valid_calendar_ids(calendar_ids));

-- Deprecated: the app reads calendar_ids now. Kept only so the previously deployed app keeps working
-- until the next deploy; drop it in a later migration.
comment on column public.members.calendar_id is 'DEPRECATED: use calendar_ids. Drop in a later migration.';
