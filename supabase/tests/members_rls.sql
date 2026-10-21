-- RLS tests for public.members. Needs stubs + migrations + supabase/seed.sql applied.
-- Every check raises an exception on failure; psql runs with ON_ERROR_STOP.
-- Test data is made up; the seeded parent is the owner's own email.

begin;

-- Fixture (as superuser): a child and a second parent.
insert into public.members (name, email, role) values
  ('Test Child', 'test.child@example.com', 'child'),
  ('Test Parent', 'test.parent2@example.com', 'parent');

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

-- 1. Parent (mixed-case email in the JWT): full read, insert, update, delete; not own row.
do $$
declare n int; child uuid; me uuid;
begin
  perform pg_temp.act_as('Jorgen.Braseth@gmail.com', 'authenticated');
  select count(*) into n from public.members;
  if n < 3 then raise exception 'parent should see all members, saw %', n; end if;

  insert into public.members (name, email, role) values ('Made Up Kid', 'made.up.kid@example.com', 'child')
    returning id into child;
  update public.members set name = 'Renamed Kid' where id = child;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'parent update affected % rows', n; end if;
  delete from public.members where id = child;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'parent delete affected % rows', n; end if;

  select id into me from public.members where email = 'jorgen.braseth@gmail.com';
  delete from public.members where id = me;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'parent deleted own row'; end if;

  -- another parent can be deleted by this parent
  delete from public.members where email = 'test.parent2@example.com';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'parent could not delete another parent'; end if;

  perform pg_temp.done();
end $$;

-- 2. Child: reads, cannot write.
do $$
declare n int;
begin
  perform pg_temp.act_as('Test.Child@example.com', 'authenticated');
  select count(*) into n from public.members;
  if n < 2 then raise exception 'child should see members, saw %', n; end if;

  begin
    insert into public.members (name, email, role) values ('Sneaky', 'sneaky@example.com', 'parent');
    raise exception 'child insert succeeded';
  exception when insufficient_privilege then null; -- RLS violation
  end;

  -- A child may update only their own avatar_path (member_avatars migration): anything else is refused.
  begin
    update public.members set role = 'parent' where email = 'test.child@example.com';
    raise exception 'child changed their own role';
  exception when insufficient_privilege then null;
  end;
  update public.members set name = 'Renamed' where email = 'test.parent2@example.com';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child update affected % rows', n; end if;

  delete from public.members where email = 'jorgen.braseth@gmail.com';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child delete affected % rows', n; end if;

  perform pg_temp.done();
end $$;

-- 3. Unknown email: sees nothing, cannot insert.
do $$
declare n int;
begin
  perform pg_temp.act_as('stranger@example.com', 'authenticated');
  select count(*) into n from public.members;
  if n <> 0 then raise exception 'stranger saw % rows', n; end if;

  begin
    insert into public.members (name, email, role) values ('Intruder', 'intruder@example.com', 'parent');
    raise exception 'stranger insert succeeded';
  exception when insufficient_privilege then null;
  end;

  -- No email claim at all behaves the same.
  perform pg_temp.act_as('', 'authenticated');
  select count(*) into n from public.members;
  if n <> 0 then raise exception 'empty email saw % rows', n; end if;

  perform pg_temp.done();
end $$;

-- 4. anon cannot read or call the helpers.
do $$
begin
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'anon');
  begin
    perform count(*) from public.members;
    raise exception 'anon select succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.is_parent();
    raise exception 'anon could call is_parent()';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();
end $$;

-- 5. Constraints: uppercase email, bad role, bad colour, blank name.
do $$
begin
  begin
    insert into public.members (name, email, role) values ('Upper', 'Upper@Example.com', 'child');
    raise exception 'uppercase email accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.members (name, email, role) values ('Bad Role', 'badrole@example.com', 'admin');
    raise exception 'bad role accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.members (name, email, role, colour) values ('Bad Colour', 'badcolour@example.com', 'child', 'blue');
    raise exception 'bad colour accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.members (name, email, role) values ('  ', 'blank@example.com', 'child');
    raise exception 'blank name accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.members (name, email, role) values ('Dup', 'jorgen.braseth@gmail.com', 'child');
    raise exception 'duplicate email accepted';
  exception when unique_violation then null;
  end;
end $$;

rollback;

\echo members_rls: all checks passed
