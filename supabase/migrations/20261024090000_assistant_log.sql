-- Voice assistant log: every question and answer, for parents' insight and the daily limit.

-- How many questions a child may ask per day (Europe/Copenhagen). Keep in sync with
-- ASSISTANT_DAILY_LIMIT in src/lib/assistant-limit.ts; change it with a new migration that replaces this function.
create function public.assistant_daily_limit()
returns int
language sql
immutable
as $$ select 30 $$;

create table public.assistant_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  question text not null check (length(question) between 1 and 1000),
  answer text not null check (length(answer) <= 4000),
  tools_used text[] not null default '{}' check (cardinality(tools_used) <= 10),
  created_at timestamptz not null default now()
);

create index assistant_log_member_created_idx on public.assistant_log (member_id, created_at desc);

alter table public.assistant_log enable row level security;

-- Daily question limit for non-parents, counted in Europe/Copenhagen days.
-- Parents and the service role (no member) are not limited.
create function public.assistant_log_daily_limit()
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
  select count(*) into n from public.assistant_log l where l.member_id = me and l.created_at >= day_start;
  if n >= public.assistant_daily_limit() then
    raise exception 'assistant_daily_limit' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger assistant_log_daily_limit
  before insert on public.assistant_log
  for each row execute function public.assistant_log_daily_limit();

revoke execute on function public.assistant_log_daily_limit() from public, anon, authenticated;

-- Questions the current member has asked today (Europe/Copenhagen). The API checks this before calling Claude.
-- Security invoker: RLS already lets every member read their own rows.
create function public.assistant_questions_today()
returns int
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::int
  from public.assistant_log l
  where l.member_id = public.current_member_id()
    and l.created_at >= date_trunc('day', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen'
$$;

revoke execute on function public.assistant_questions_today() from public, anon;
grant execute on function public.assistant_questions_today() to authenticated;

create policy "assistant_log: parents read all"
  on public.assistant_log for select to authenticated
  using (public.is_parent());

create policy "assistant_log: members read own"
  on public.assistant_log for select to authenticated
  using (member_id = public.current_member_id());

create policy "assistant_log: members insert own"
  on public.assistant_log for insert to authenticated
  with check (member_id = public.current_member_id());

create policy "assistant_log: parents delete"
  on public.assistant_log for delete to authenticated
  using (public.is_parent());

revoke all on public.assistant_log from anon;
