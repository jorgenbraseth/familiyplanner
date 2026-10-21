-- Tests for routine_items, routine_settings, routine_checks and routine star requests.
-- Made-up data only.
begin;

insert into public.members (name, email, role) values
  ('Routine Child A', 'routine.child.a@example.com', 'child'),
  ('Routine Child B', 'routine.child.b@example.com', 'child');

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

-- 1. Parent creates tracks, tasks, items and settings.
do $$
declare a uuid; b uuid; p uuid; ta uuid; tb uuid; ka uuid; kb uuid; i1 uuid; i2 uuid; ib uuid; n int;
begin
  select id into a from public.members where email = 'routine.child.a@example.com';
  select id into b from public.members where email = 'routine.child.b@example.com';
  select id into p from public.members where email = 'jorgen.braseth@gmail.com';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

  insert into public.star_tracks (member_id, name, goal, milestone_every) values (a, 'Routine A', 10, 5) returning id into ta;
  insert into public.star_tracks (member_id, name, goal, milestone_every) values (b, 'Routine B', 10, 5) returning id into tb;
  insert into public.star_tasks (member_id, name, stars) values (a, 'Morning done', 3) returning id into ka;
  insert into public.star_tasks (member_id, name, stars) values (b, 'Morning done B', 2) returning id into kb;

  insert into public.routine_items (member_id, slot, name, sort) values (a, 'morning', 'Brush teeth', 0) returning id into i1;
  insert into public.routine_items (member_id, slot, name, sort) values (a, 'morning', 'Get dressed', 1) returning id into i2;
  insert into public.routine_items (member_id, slot, name, sort) values (b, 'morning', 'Pack bag', 0) returning id into ib;
  insert into public.routine_settings (member_id, slot, star_task_id) values (a, 'morning', ka);
  insert into public.routine_settings (member_id, slot, star_task_id) values (b, 'morning', kb);

  begin
    insert into public.routine_items (member_id, slot, name) values (a, 'morning', 'Brush teeth');
    raise exception 'duplicate item accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.routine_items (member_id, slot, name) values (p, 'morning', 'Parent item');
    raise exception 'item for a parent accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.routine_items (member_id, slot, name) values (a, 'noon', 'Bad slot');
    raise exception 'bad slot accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.routine_items (member_id, slot, name) values (a, 'evening', '');
    raise exception 'empty name accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.routine_items (member_id, slot, name) values (a, 'evening', repeat('x', 61));
    raise exception '61-char name accepted';
  exception when check_violation then null;
  end;

  -- 15 evening items are fine, the 16th fails.
  for n in 1..15 loop
    insert into public.routine_items (member_id, slot, name, sort) values (a, 'evening', 'Evening ' || n, n);
  end loop;
  begin
    insert into public.routine_items (member_id, slot, name) values (a, 'evening', 'Evening 16');
    raise exception '16th item accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.routine_settings (member_id, slot, star_task_id) values (a, 'evening', kb);
    raise exception 'settings with another child''s task accepted';
  exception when check_violation then null;
  end;
  insert into public.routine_settings (member_id, slot) values (a, 'evening');

  perform pg_temp.done();
  insert into ids values ('a', a), ('b', b), ('ta', ta), ('ka', ka), ('i1', i1), ('i2', i2), ('ib', ib);
end $$;

-- 2. Child A sees own items and settings only; cannot edit them.
do $$
declare n int; rows int;
begin
  perform pg_temp.act_as('routine.child.a@example.com', 'authenticated');
  select count(*) into n from public.routine_items where member_id = (select v from ids where k = 'a');
  if n <> 17 then raise exception 'child A should see 17 items, saw %', n; end if;
  select count(*) into n from public.routine_items where member_id = (select v from ids where k = 'b');
  if n = 0 then raise exception 'child A should read sibling items'; end if;
  select count(*) into n from public.routine_settings where member_id = (select v from ids where k = 'a');
  if n <> 2 then raise exception 'child A should see 2 settings, saw %', n; end if;
  select count(*) into n from public.routine_settings where member_id = (select v from ids where k = 'b');
  if n = 0 then raise exception 'child A should read sibling settings'; end if;

  update public.routine_items set name = 'Hacked' where id = (select v from ids where k = 'i1');
  get diagnostics rows = row_count;
  if rows <> 0 then raise exception 'child edited an item'; end if;
  delete from public.routine_items where id = (select v from ids where k = 'i1');
  get diagnostics rows = row_count;
  if rows <> 0 then raise exception 'child deleted an item'; end if;
  begin
    insert into public.routine_items (member_id, slot, name) values ((select v from ids where k = 'a'), 'morning', 'Own item');
    raise exception 'child created an item';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.routine_settings set star_task_id = null where member_id = (select v from ids where k = 'a') and slot = 'morning';
    get diagnostics rows = row_count;
    if rows <> 0 then raise exception 'child edited settings'; end if;
  end;
  perform pg_temp.done();
end $$;

-- 3. Checks: today ok, yesterday and a sibling's item fail, no updates, uncheck today works.
do $$
declare a uuid; i1 uuid; ib uuid; n int; rows int; c uuid;
begin
  select v into a from ids where k = 'a';
  select v into i1 from ids where k = 'i1';
  select v into ib from ids where k = 'ib';
  perform pg_temp.act_as('routine.child.a@example.com', 'authenticated');

  insert into public.routine_checks (item_id, member_id, date) values (i1, a, public.routine_today()) returning id into c;
  begin
    insert into public.routine_checks (item_id, member_id, date) values (i1, a, public.routine_today());
    raise exception 'double check accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.routine_checks (item_id, member_id, date)
      values ((select v from ids where k = 'i2'), a, public.routine_today() - 1);
    raise exception 'check for yesterday accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.routine_checks (item_id, member_id, date) values (ib, a, public.routine_today());
    raise exception 'check of a sibling''s item accepted (as self)';
  exception when check_violation then null;
  end;
  begin
    insert into public.routine_checks (item_id, member_id, date)
      values (ib, (select v from ids where k = 'b'), public.routine_today());
    raise exception 'check of a sibling''s item accepted (as sibling)';
  exception when insufficient_privilege then null;
  end;

  update public.routine_checks set date = public.routine_today() where id = c;
  get diagnostics rows = row_count;
  if rows <> 0 then raise exception 'child updated a check'; end if;

  delete from public.routine_checks where id = c;
  get diagnostics rows = row_count;
  if rows <> 1 then raise exception 'child could not uncheck today''s check'; end if;
  select count(*) into n from public.routine_checks;
  if n <> 0 then raise exception 'check still there'; end if;
  perform pg_temp.done();
end $$;

-- 4. Child B cannot see A's checks; a parent's old check can't be deleted by the child.
do $$
declare a uuid; i1 uuid; c uuid; rows int; n int;
begin
  select v into a from ids where k = 'a';
  select v into i1 from ids where k = 'i1';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  insert into public.routine_checks (item_id, member_id, date) values (i1, a, public.routine_today() - 1) returning id into c;
  perform pg_temp.done();

  perform pg_temp.act_as('routine.child.b@example.com', 'authenticated');
  select count(*) into n from public.routine_checks;
  if n = 0 then raise exception 'child B should read A''s checks'; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('routine.child.a@example.com', 'authenticated');
  delete from public.routine_checks where id = c;
  get diagnostics rows = row_count;
  if rows <> 0 then raise exception 'child deleted a check from yesterday'; end if;
  perform pg_temp.done();
end $$;

-- 5. Routine star requests.
do $$
declare a uuid; ta uuid; ka uuid; i1 uuid; i2 uuid; amt int; today date;
begin
  select v into a from ids where k = 'a';
  select v into ta from ids where k = 'ta';
  select v into ka from ids where k = 'ka';
  select v into i1 from ids where k = 'i1';
  select v into i2 from ids where k = 'i2';
  perform pg_temp.act_as('routine.child.a@example.com', 'authenticated');
  today := public.routine_today();

  -- Nothing checked yet.
  begin
    insert into public.stars (track_id, member_id, reason, requested_by, task_id, routine_slot, routine_date)
      values (ta, a, 'Morgenstell', a, ka, 'morning', today);
    raise exception 'routine star accepted with nothing checked';
  exception when check_violation then
    if sqlerrm <> 'routine_not_complete' then raise; end if;
  end;

  -- Only one of two checked.
  insert into public.routine_checks (item_id, member_id, date) values (i1, a, today);
  begin
    insert into public.stars (track_id, member_id, reason, requested_by, task_id, routine_slot, routine_date)
      values (ta, a, 'Morgenstell', a, ka, 'morning', today);
    raise exception 'routine star accepted with one item missing';
  exception when check_violation then
    if sqlerrm <> 'routine_not_complete' then raise; end if;
  end;

  insert into public.routine_checks (item_id, member_id, date) values (i2, a, today);

  -- Wrong date.
  begin
    insert into public.stars (track_id, member_id, reason, requested_by, task_id, routine_slot, routine_date)
      values (ta, a, 'Morgenstell', a, ka, 'morning', today - 1);
    raise exception 'routine star accepted for yesterday';
  exception when check_violation then
    if sqlerrm <> 'routine_not_complete' then raise; end if;
  end;

  -- Complete: accepted, pending, amount from the task.
  insert into public.stars (track_id, member_id, reason, requested_by, task_id, routine_slot, routine_date)
    values (ta, a, 'Morgenstell', a, ka, 'morning', today);
  select amount into amt from public.stars where routine_slot = 'morning' and routine_date = today and member_id = a;
  if amt <> 3 then raise exception 'routine star amount should be 3, was %', amt; end if;
  if (select status from public.stars where routine_slot = 'morning' and member_id = a) <> 'pending' then
    raise exception 'routine star not pending';
  end if;

  -- Second request for the same slot and day.
  begin
    insert into public.stars (track_id, member_id, reason, requested_by, task_id, routine_slot, routine_date)
      values (ta, a, 'Morgenstell igjen', a, ka, 'morning', today);
    raise exception 'second routine star accepted';
  exception when unique_violation then null;
  end;

  -- Slot without date is rejected by the check constraint; plain requests still work.
  begin
    insert into public.stars (track_id, member_id, reason, requested_by, routine_slot)
      values (ta, a, 'Half routine', a, 'morning');
    raise exception 'routine_slot without routine_date accepted';
  exception when check_violation then null;
  end;
  insert into public.stars (track_id, member_id, reason, requested_by) values (ta, a, 'Plain request', a);
  perform pg_temp.done();
end $$;

-- 6. Anon sees nothing.
do $$
begin
  perform pg_temp.act_as('routine.child.a@example.com', 'anon');
  begin
    perform count(*) from public.routine_items;
    raise exception 'anon could read routine_items';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.routine_settings;
    raise exception 'anon could read routine_settings';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.routine_checks;
    raise exception 'anon could read routine_checks';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();
end $$;

rollback;

\echo routines_rls: all checks passed
