-- Members: the allowlist. Only emails in this table can use the app.

create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  email text not null unique check (email = lower(email)),
  role text not null check (role in ('parent', 'child')),
  calendar_id text,
  colour text not null default '#2563eb' check (colour ~ '^#[0-9a-fA-F]{6}$'),
  locale text not null default 'nb-NO',
  created_at timestamptz not null default now()
);

alter table public.members enable row level security;

-- The signed-in member, matched on the (lowercased) email in the session.
-- security definer so policies on members can use it without recursing into RLS.
create function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.members where email = lower(auth.email())
$$;

create function public.is_parent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members where email = lower(auth.email()) and role = 'parent'
  )
$$;

revoke execute on function public.current_member_id() from public, anon;
revoke execute on function public.is_parent() from public, anon;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.is_parent() to authenticated;

-- Everyone allowlisted can read all members; only parents write.
create policy "members: allowlisted read"
  on public.members for select to authenticated
  using (public.current_member_id() is not null);

create policy "members: parents insert"
  on public.members for insert to authenticated
  with check (public.is_parent());

create policy "members: parents update"
  on public.members for update to authenticated
  using (public.is_parent())
  with check (public.is_parent());

-- A parent can't delete their own row (avoids locking the family out).
create policy "members: parents delete others"
  on public.members for delete to authenticated
  using (public.is_parent() and id <> public.current_member_id());

revoke all on public.members from anon;
