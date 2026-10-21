-- RLS tests for member avatars (members.avatar_path and the `avatars` bucket policies).
-- Needs stubs + migrations + supabase/seed.sql applied. Test data is made up.
begin;

insert into public.members (id, name, email, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'Test Child', 'avatar.child@example.com', 'child'),
  ('00000000-0000-0000-0000-0000000000c2', 'Other Child', 'avatar.child2@example.com', 'child');

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
declare n int;
begin
  -- Child sets their own avatar_path.
  perform pg_temp.act_as('avatar.child@example.com', 'authenticated');
  update public.members set avatar_path = '00000000-0000-0000-0000-0000000000c1/a1.webp'
    where id = '00000000-0000-0000-0000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'child could not set own avatar (% rows)', n; end if;

  -- ... but nothing else on their row.
  begin
    update public.members set name = 'Hacked' where id = '00000000-0000-0000-0000-0000000000c1';
    raise exception 'child changed their name';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.members set role = 'parent' where id = '00000000-0000-0000-0000-0000000000c1';
    raise exception 'child made themselves parent';
  exception when insufficient_privilege then null;
  end;

  -- Not someone else's row.
  update public.members set avatar_path = '00000000-0000-0000-0000-0000000000c2/a.webp'
    where id = '00000000-0000-0000-0000-0000000000c2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child changed another member avatar'; end if;

  -- Path must start with the member's own id and have a valid shape.
  begin
    update public.members set avatar_path = '00000000-0000-0000-0000-0000000000c2/a.webp'
      where id = '00000000-0000-0000-0000-0000000000c1';
    raise exception 'foreign path accepted';
  exception when check_violation then null;
  end;
  begin
    update public.members set avatar_path = '00000000-0000-0000-0000-0000000000c1/../x.gif'
      where id = '00000000-0000-0000-0000-0000000000c1';
    raise exception 'bad path accepted';
  exception when check_violation then null;
  end;

  -- Storage: own folder yes, other folder no, everyone can read.
  insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-0000000000c1/a1.webp');
  begin
    insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-0000000000c2/a1.webp');
    raise exception 'child uploaded into another folder';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();

  perform pg_temp.act_as('avatar.child2@example.com', 'authenticated');
  select count(*) into n from storage.objects where bucket_id = 'avatars';
  if n <> 1 then raise exception 'family member should read avatars, saw %', n; end if;
  delete from storage.objects where bucket_id = 'avatars';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child deleted another member avatar file'; end if;
  perform pg_temp.done();

  -- Parent: any member's avatar and files.
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  update public.members set avatar_path = '00000000-0000-0000-0000-0000000000c2/p.jpg'
    where id = '00000000-0000-0000-0000-0000000000c2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'parent could not set child avatar'; end if;
  insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-0000000000c2/p.jpg');
  delete from storage.objects where name = '00000000-0000-0000-0000-0000000000c1/a1.webp';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'parent could not delete avatar file'; end if;
  perform pg_temp.done();
end $$;

rollback;

\echo member_avatars_rls: all checks passed
