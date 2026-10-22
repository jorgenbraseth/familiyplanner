-- RLS tests for members.theme: a member may change their own theme (and avatar_path), nothing else, nobody else's.
-- Needs stubs + migrations + supabase/seed.sql applied. Test data is made up.
begin;

insert into public.members (id, name, email, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'Theme Child', 'theme.child@example.com', 'child'),
  ('00000000-0000-0000-0000-0000000000d2', 'Other Child', 'theme.child2@example.com', 'child');

create function pg_temp.act_as(p_email text, p_role text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('email', p_email)::text, true);
  execute format('set local role %I', p_role);
end $$;
create function pg_temp.done() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
grant execute on function pg_temp.act_as(text, text), pg_temp.done() to public;

do $$
declare n int; t text;
begin
  select theme into t from public.members where id = '00000000-0000-0000-0000-0000000000d1';
  if t <> 'skog' then raise exception 'default theme should be skog, got %', t; end if;

  -- Child changes their own theme.
  perform pg_temp.act_as('theme.child@example.com', 'authenticated');
  update public.members set theme = 'kpop' where id = '00000000-0000-0000-0000-0000000000d1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'child could not set own theme (% rows)', n; end if;

  -- Theme and avatar_path together are fine.
  update public.members set theme = 'orden', avatar_path = '00000000-0000-0000-0000-0000000000d1/a.webp'
    where id = '00000000-0000-0000-0000-0000000000d1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'child could not set theme and avatar together'; end if;

  -- Not any other column, also not together with the theme.
  begin
    update public.members set name = 'Hacked' where id = '00000000-0000-0000-0000-0000000000d1';
    raise exception 'child changed their name';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.members set theme = 'fjord', role = 'parent' where id = '00000000-0000-0000-0000-0000000000d1';
    raise exception 'child changed role together with theme';
  exception when insufficient_privilege then null;
  end;

  -- Not someone else's theme.
  update public.members set theme = 'godteri' where id = '00000000-0000-0000-0000-0000000000d2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child changed another member theme'; end if;

  -- Unknown theme ids are rejected.
  begin
    update public.members set theme = 'neon' where id = '00000000-0000-0000-0000-0000000000d1';
    raise exception 'unknown theme accepted';
  exception when check_violation then null;
  end;
  perform pg_temp.done();

  -- Parent: own theme and a child's.
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  update public.members set theme = 'morgengry' where email = 'jorgen.braseth@gmail.com';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'parent could not set own theme'; end if;
  update public.members set theme = 'fjord' where id = '00000000-0000-0000-0000-0000000000d2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'parent could not set a child theme'; end if;
  perform pg_temp.done();
end $$;

rollback;

\echo member_theme_rls: all checks passed
