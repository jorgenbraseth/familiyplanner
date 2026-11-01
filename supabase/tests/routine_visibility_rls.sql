-- Tests for routine_settings.visible_from / visible_until: only parents change them; the window must be ordered.
-- Made-up data only.
begin;

insert into public.members (name, email, role) values
  ('Visibility Child', 'visibility.child@example.com', 'child');

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
declare c uuid; n int; raised boolean;
begin
  select id into c from public.members where email = 'visibility.child@example.com';

  -- A parent saves a window; nulls (the defaults) are allowed.
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  insert into public.routine_settings (member_id, slot) values (c, 'evening');
  update public.routine_settings set visible_from = '17:30', visible_until = '23:59' where member_id = c and slot = 'evening';
  select count(*) into n from public.routine_settings where member_id = c and visible_from = '17:30' and visible_until = '23:59';
  if n <> 1 then raise exception 'parent could not set the window (%)', n; end if;

  -- An unordered window is rejected.
  raised := false;
  begin
    update public.routine_settings set visible_from = '10:00', visible_until = '09:00' where member_id = c and slot = 'evening';
  exception when check_violation then raised := true; end;
  if not raised then raise exception 'unordered window accepted'; end if;
  raised := false;
  begin
    update public.routine_settings set visible_from = '10:00', visible_until = '10:00' where member_id = c and slot = 'evening';
  exception when check_violation then raised := true; end;
  if not raised then raise exception 'empty window accepted'; end if;

  -- The child reads their own window but changes nothing (RLS: no update policy, so zero rows).
  perform pg_temp.act_as('visibility.child@example.com', 'authenticated');
  select count(*) into n from public.routine_settings where member_id = c and visible_from = '17:30';
  if n <> 1 then raise exception 'child could not read own window'; end if;
  update public.routine_settings set visible_from = '00:00' where member_id = c and slot = 'evening';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child changed the window'; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  select count(*) into n from public.routine_settings where member_id = c and visible_from = '17:30';
  if n <> 1 then raise exception 'window was changed by the child'; end if;
  perform pg_temp.done();
end $$;

rollback;

\echo routine_visibility_rls: all checks passed
