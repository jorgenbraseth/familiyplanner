-- Tests for star tasks that are not tied to a track: a task is for one child or for all children
-- and applies to the child's current active track. Made-up data only.
-- (The data conversion of the migration is tested by migration_tasks_without_tracks.sh.)
begin;

insert into public.members (name, email, role) values
  ('Free Child A', 'free.child.a@example.com', 'child'),
  ('Free Child B', 'free.child.b@example.com', 'child'),
  ('Free Parent', 'free.parent@example.com', 'parent');

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

create temp table ids (k text primary key, v uuid);
grant all on ids to public;

-- 1. Parent creates tracks and tasks: own, sibling's and for all children.
do $$
declare a uuid; b uuid; p uuid; ta uuid; tb uuid; ka uuid; kb uuid; kall uuid;
begin
  select id into a from public.members where email = 'free.child.a@example.com';
  select id into b from public.members where email = 'free.child.b@example.com';
  select id into p from public.members where email = 'free.parent@example.com';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

  insert into public.star_tracks (member_id, name, goal, milestone_every) values (a, 'Free A', 10, 5) returning id into ta;
  insert into public.star_tracks (member_id, name, goal, milestone_every) values (b, 'Free B', 10, 5) returning id into tb;
  insert into public.star_tasks (member_id, name, stars) values (a, 'Own A', 3) returning id into ka;
  insert into public.star_tasks (member_id, name, stars) values (b, 'Own B', 2) returning id into kb;
  insert into public.star_tasks (member_id, name, stars) values (null, 'For all', 4) returning id into kall;

  -- names are unique per child, and among the all-children tasks
  begin
    insert into public.star_tasks (member_id, name, stars) values (a, 'Own A', 1);
    raise exception 'duplicate name for a child accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.star_tasks (member_id, name, stars) values (null, 'For all', 1);
    raise exception 'duplicate all-children name accepted';
  exception when unique_violation then null;
  end;
  -- the same name for another child, or for all, is fine
  insert into public.star_tasks (member_id, name, stars) values (b, 'Own A', 1);
  insert into public.star_tasks (member_id, name, stars) values (null, 'Own A', 1);
  -- a task cannot belong to a parent
  begin
    insert into public.star_tasks (member_id, name, stars) values (p, 'Parent task', 1);
    raise exception 'task for a parent accepted';
  exception when check_violation then null;
  end;
  -- the track_id column is gone
  begin
    execute 'select track_id from public.star_tasks';
    raise exception 'track_id still exists';
  exception when undefined_column then null;
  end;

  perform pg_temp.done();
  insert into ids values ('a', a), ('b', b), ('ta', ta), ('tb', tb), ('ka', ka), ('kb', kb), ('kall', kall);
end $$;

-- 2. Visibility: a child sees own + all-children tasks, never a sibling's.
do $$
declare n int;
begin
  perform pg_temp.act_as('free.child.a@example.com', 'authenticated');
  select count(*) into n from public.star_tasks;
  -- Own A, For all, and the all-children 'Own A'
  if n <> 3 then raise exception 'child A should see 3 tasks, saw %', n; end if;
  select count(*) into n from public.star_tasks where member_id = (select v from ids where k = 'b');
  if n <> 0 then raise exception 'child A saw sibling tasks'; end if;
  select count(*) into n from public.star_tasks where member_id is null;
  if n <> 2 then raise exception 'child A should see 2 all-children tasks, saw %', n; end if;
  begin
    insert into public.star_tasks (member_id, name, stars) values (null, 'Mine', 10);
    raise exception 'child created a task';
  exception when insufficient_privilege then null;
  end;
  update public.star_tasks set stars = 10;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child updated % tasks', n; end if;
  delete from public.star_tasks;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child deleted % tasks', n; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('free.child.b@example.com', 'authenticated');
  select count(*) into n from public.star_tasks where name = 'Own A' and member_id is not null;
  if n <> 1 then raise exception 'child B should see only their own ''Own A'', saw %', n; end if;
  select count(*) into n from public.star_tasks where id = (select v from ids where k = 'ka');
  if n <> 0 then raise exception 'child B saw child A''s task'; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('stranger@example.com', 'authenticated');
  select count(*) into n from public.star_tasks;
  if n <> 0 then raise exception 'stranger saw tasks'; end if;
  perform pg_temp.done();
end $$;

-- 3. Star requests: own and all-children tasks work, a sibling's does not.
do $$
declare a uuid; ta uuid; ka uuid; kb uuid; kall uuid; amt int;
begin
  select v into a from ids where k = 'a';
  select v into ta from ids where k = 'ta';
  select v into ka from ids where k = 'ka';
  select v into kb from ids where k = 'kb';
  select v into kall from ids where k = 'kall';
  perform pg_temp.act_as('free.child.a@example.com', 'authenticated');

  insert into public.stars (track_id, member_id, reason, requested_by, task_id, amount)
    values (ta, a, 'Own A', a, ka, 99);
  select amount into amt from public.stars where reason = 'Own A' and member_id = a;
  if amt <> 3 then raise exception 'own task amount not applied, got %', amt; end if;

  insert into public.stars (track_id, member_id, reason, requested_by, task_id)
    values (ta, a, 'For all', a, kall);
  select amount into amt from public.stars where reason = 'For all' and member_id = a;
  if amt <> 4 then raise exception 'all-children task amount not applied, got %', amt; end if;

  begin
    insert into public.stars (track_id, member_id, reason, requested_by, task_id)
      values (ta, a, 'Own B', a, kb);
    raise exception 'sibling''s task accepted';
  exception when check_violation then null;
  end;
  perform pg_temp.done();

  -- a parent giving a star is held to the same rule
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  begin
    insert into public.stars (track_id, member_id, reason, status, task_id)
      values (ta, a, 'Own B', 'approved', kb);
    raise exception 'parent gave a star with a sibling''s task';
  exception when check_violation then null;
  end;
  perform pg_temp.done();
end $$;

-- 4. Routine settings accept own and all-children tasks, reject a sibling's.
do $$
declare a uuid; ka uuid; kb uuid; kall uuid;
begin
  select v into a from ids where k = 'a';
  select v into ka from ids where k = 'ka';
  select v into kb from ids where k = 'kb';
  select v into kall from ids where k = 'kall';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

  insert into public.routine_settings (member_id, slot, star_task_id) values (a, 'morning', ka);
  update public.routine_settings set star_task_id = kall where member_id = a and slot = 'morning';
  begin
    update public.routine_settings set star_task_id = kb where member_id = a and slot = 'morning';
    raise exception 'routine setting accepted a sibling''s task';
  exception when check_violation then null;
  end;
  begin
    insert into public.routine_settings (member_id, slot, star_task_id) values (a, 'evening', kb);
    raise exception 'routine setting insert accepted a sibling''s task';
  exception when check_violation then null;
  end;
  perform pg_temp.done();
end $$;

-- 5. Tasks outlive tracks: complete the track, start a new one, the same task (and the routine's
-- task) works and the star goes on the new track.
do $$
declare a uuid; ta uuid; ta2 uuid; ka uuid; kall uuid; i1 uuid; today date; amt int; n int;
begin
  select v into a from ids where k = 'a';
  select v into ta from ids where k = 'ta';
  select v into ka from ids where k = 'ka';
  select v into kall from ids where k = 'kall';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

  insert into public.routine_items (member_id, slot, name) values (a, 'morning', 'Brush teeth') returning id into i1;
  update public.routine_settings set star_task_id = kall where member_id = a and slot = 'morning';
  update public.star_tracks set status = 'completed', completed_at = now() where id = ta;
  insert into public.star_tracks (member_id, name, goal, milestone_every) values (a, 'Free A 2', 10, 5) returning id into ta2;

  select count(*) into n from public.star_tasks where member_id = a;
  if n <> 1 then raise exception 'tasks changed when the track was completed'; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('free.child.a@example.com', 'authenticated');
  today := public.routine_today();

  -- the old track is no longer the star's track, but the same tasks still work on the new one
  insert into public.stars (track_id, member_id, reason, requested_by, task_id)
    values (ta2, a, 'Own A', a, ka);
  select amount into amt from public.stars where track_id = ta2 and task_id = ka;
  if amt <> 3 then raise exception 'task amount on the new track, got %', amt; end if;

  -- routine request on the new track with the all-children task
  insert into public.routine_checks (item_id, member_id, date) values (i1, a, today);
  insert into public.stars (track_id, member_id, reason, requested_by, task_id, routine_slot, routine_date)
    values (ta2, a, 'Morgenstell', a, kall, 'morning', today);
  select amount into amt from public.stars where track_id = ta2 and routine_slot = 'morning';
  if amt <> 4 then raise exception 'routine star amount should be 4, was %', amt; end if;
  -- ... and only with the routine's task
  begin
    insert into public.stars (track_id, member_id, reason, requested_by, task_id, routine_slot, routine_date)
      values (ta2, a, 'Morgenstell', a, ka, 'evening', today);
    raise exception 'routine star with the wrong task accepted';
  exception when check_violation then null;
  end;
  perform pg_temp.done();
end $$;

rollback;

\echo tasks_without_tracks_rls: all checks passed
