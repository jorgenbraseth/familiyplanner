-- Supabase Auth "Before User Created" hook: strangers never get an auth.users row.
-- Enable it in the dashboard (Authentication > Hooks); see docs/SETUP.md. The app's own
-- allowlist check still applies if the hook is off.
--
-- Per the Supabase docs the function is NOT security definer; supabase_auth_admin gets explicit
-- grants (schema usage, select on members) plus an RLS policy to read members instead.

create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
as $$
begin
  if exists (
    select 1 from public.members
    where email = lower(event->'user'->>'email')
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'not_invited')
  );
end $$;

grant usage on schema public to supabase_auth_admin;
grant select on table public.members to supabase_auth_admin;

create policy "members: auth hook reads"
  on public.members for select to supabase_auth_admin
  using (true);

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;
