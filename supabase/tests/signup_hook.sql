-- Tests for public.hook_before_user_created. Made-up data only.
begin;

insert into public.members (name, email, role) values ('Hook Child', 'hook.child@example.com', 'child');

do $$
declare r jsonb;
begin
  r := public.hook_before_user_created('{"user":{"email":"Hook.Child@Example.com"}}'::jsonb);
  if r <> '{}'::jsonb then raise exception 'member (mixed case) rejected: %', r; end if;

  r := public.hook_before_user_created('{"user":{"email":"stranger@example.com"}}'::jsonb);
  if r->'error'->>'message' <> 'not_invited' or (r->'error'->>'http_code')::int <> 403 then
    raise exception 'stranger not rejected correctly: %', r;
  end if;

  r := public.hook_before_user_created('{"user":{}}'::jsonb);
  if r->'error'->>'message' <> 'not_invited' then raise exception 'missing email allowed: %', r; end if;

  -- It must also work as the auth role (RLS policy + grants), and be closed to app roles.
  execute 'set local role supabase_auth_admin';
  r := public.hook_before_user_created('{"user":{"email":"hook.child@example.com"}}'::jsonb);
  if r <> '{}'::jsonb then raise exception 'auth admin could not read members: %', r; end if;
  reset role;

  execute 'set local role authenticated';
  begin
    perform public.hook_before_user_created('{}'::jsonb);
    raise exception 'authenticated could call the hook';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

rollback;

\echo signup_hook: all checks passed
