-- Voice assistant on the family screen. The screen is a parent's session in screen mode, so its log
-- rows have member_id = that parent. `asked_for` records WHO the question was asked as on the shared
-- tablet (the person selected in the rail: a parent or a child). Normal sessions never set it.
--
-- Daily limit (Europe/Copenhagen day, assistant_daily_limit()): a child's count is every row where
-- member_id = child (asked on the child's own phone) OR asked_for = child (asked as the child on the
-- screen). Parents are unlimited, also when asked on the screen.

alter table public.assistant_log
  add column asked_for uuid references public.members (id) on delete set null;

create index assistant_log_asked_for_created_idx on public.assistant_log (asked_for, created_at desc)
  where asked_for is not null;

-- Questions a member has used today. Security definer: the screen cannot read other members' log
-- rows under RLS, yet needs the child's total. Internal (execute revoked); the trigger and
-- assistant_questions_today() call it.
create function public.assistant_count_today(p_member uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.assistant_log l
  where (l.member_id = p_member or l.asked_for = p_member)
    and l.created_at >= date_trunc('day', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen'
$$;

revoke execute on function public.assistant_count_today(uuid) from public, anon, authenticated;

-- Replaces the zero-argument function: without an argument it counts the caller; the screen may name
-- the person it is asking as (anyone else asking for another member is refused).
drop function public.assistant_questions_today();

create function public.assistant_questions_today(p_for uuid default null)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_member_id();
begin
  if me is null then
    return 0;
  end if;
  if p_for is null or p_for = me then
    return public.assistant_count_today(me);
  end if;
  if not public.is_screen() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.members m where m.id = p_for and m.role in ('parent', 'child')) then
    return 0;
  end if;
  return public.assistant_count_today(p_for);
end $$;

revoke execute on function public.assistant_questions_today(uuid) from public, anon;
grant execute on function public.assistant_questions_today(uuid) to authenticated;

-- Insert rule: own rows only (member_id = the signed-in member); asked_for is for the screen alone and
-- must name a parent or a child. A normal session must leave it null.
drop policy "assistant_log: members insert own" on public.assistant_log;
create policy "assistant_log: members insert own"
  on public.assistant_log for insert to authenticated
  with check (
    member_id = public.current_member_id()
    and (
      asked_for is null
      or (public.is_screen() and exists (select 1 from public.members m where m.id = asked_for and m.role in ('parent', 'child')))
    )
  );

-- Limit trigger: the limited subject is the person the question was asked as (asked_for, else the
-- member). Parents and the service role are not limited.
create or replace function public.assistant_log_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject uuid := coalesce(new.asked_for, public.current_member_id());
  subject_role text;
begin
  if public.current_member_id() is null or subject is null then
    return new;
  end if;
  select m.role into subject_role from public.members m where m.id = subject;
  if subject_role is distinct from 'child' then
    return new;
  end if;
  if public.assistant_count_today(subject) >= public.assistant_daily_limit() then
    raise exception 'assistant_daily_limit' using errcode = 'check_violation';
  end if;
  return new;
end $$;
