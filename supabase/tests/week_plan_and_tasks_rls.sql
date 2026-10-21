-- Tests for star_tasks, star amounts, amount-based rewards, school_days and plan_items period/times.
-- Made-up data only.
begin;

insert into public.members (name, email, role) values
  ('Task Child A', 'task.child.a@example.com', 'child'),
  ('Task Child B', 'task.child.b@example.com', 'child');

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

-- 1. Parent creates tracks and tasks.
do $$
declare a uuid; b uuid; ta uuid; tb uuid; k1 uuid; k2 uuid; kb uuid;
begin
  select id into a from public.members where email = 'task.child.a@example.com';
  select id into b from public.members where email = 'task.child.b@example.com';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

  insert into public.star_tracks (member_id, name, goal, milestone_every) values (a, 'Tasks A', 10, 5) returning id into ta;
  insert into public.star_tracks (member_id, name, goal, milestone_every) values (b, 'Tasks B', 10, 5) returning id into tb;
  insert into public.star_tasks (track_id, name, stars, sort) values (ta, 'Tidy room', 3, 0) returning id into k1;
  insert into public.star_tasks (track_id, name, stars, sort) values (ta, 'Help cook', 1, 1) returning id into k2;
  insert into public.star_tasks (track_id, name, stars, sort) values (tb, 'Read a book', 2, 0) returning id into kb;

  begin
    insert into public.star_tasks (track_id, name, stars) values (ta, 'Tidy room', 2);
    raise exception 'duplicate task name accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.star_tasks (track_id, name, stars) values (ta, 'Zero', 0);
    raise exception 'task with 0 stars accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.star_tasks (track_id, name, stars) values (ta, 'Eleven', 11);
    raise exception 'task with 11 stars accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.star_tasks (track_id, name, stars) values (ta, '', 1);
    raise exception 'empty task name accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.star_tasks (track_id, name, stars) values (ta, repeat('x', 61), 1);
    raise exception '61-char task name accepted';
  exception when check_violation then null;
  end;

  perform pg_temp.done();
  insert into ids values ('a', a), ('b', b), ('ta', ta), ('tb', tb), ('k1', k1), ('k2', k2), ('kb', kb);
end $$;

-- 2. Visibility of tasks.
do $$
declare n int;
begin
  perform pg_temp.act_as('task.child.a@example.com', 'authenticated');
  select count(*) into n from public.star_tasks;
  if n <> 2 then raise exception 'child A should see 2 tasks, saw %', n; end if;
  select count(*) into n from public.star_tasks where track_id = (select v from ids where k = 'tb');
  if n <> 0 then raise exception 'child A saw sibling tasks'; end if;
  begin
    insert into public.star_tasks (track_id, name, stars) values ((select v from ids where k = 'ta'), 'Mine', 10);
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

  perform pg_temp.act_as('stranger@example.com', 'authenticated');
  select count(*) into n from public.star_tasks;
  if n <> 0 then raise exception 'stranger saw tasks'; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'anon');
  begin
    perform count(*) from public.star_tasks;
    raise exception 'anon read star_tasks';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();
end $$;

-- 3. Amounts.
do $$
declare a uuid; b uuid; ta uuid; tb uuid; k1 uuid; kb uuid; amt int;
begin
  select v into a from ids where k = 'a';
  select v into b from ids where k = 'b';
  select v into ta from ids where k = 'ta';
  select v into tb from ids where k = 'tb';
  select v into k1 from ids where k = 'k1';
  select v into kb from ids where k = 'kb';

  perform pg_temp.act_as('task.child.a@example.com', 'authenticated');

  -- the client's amount is ignored when a task is given
  insert into public.stars (track_id, member_id, reason, requested_by, task_id, amount)
    values (ta, a, 'Tidy room', a, k1, 99);
  select amount into amt from public.stars where reason = 'Tidy room';
  if amt <> 3 then raise exception 'task amount not applied, got %', amt; end if;

  -- without a task a child always gets 1
  insert into public.stars (track_id, member_id, reason, requested_by, amount)
    values (ta, a, 'Free text', a, 5);
  select amount into amt from public.stars where reason = 'Free text';
  if amt <> 1 then raise exception 'child amount not forced to 1, got %', amt; end if;

  -- a task from another track is rejected
  begin
    insert into public.stars (track_id, member_id, reason, requested_by, task_id)
      values (ta, a, 'Wrong task', a, kb);
    raise exception 'task from another track accepted';
  exception when check_violation then null;
  end;
  perform pg_temp.done();

  -- parent may set an amount directly
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  insert into public.stars (track_id, member_id, reason, status, amount) values (ta, a, 'Parent gave 3', 'approved', 3);
  select amount into amt from public.stars where reason = 'Parent gave 3';
  if amt <> 3 then raise exception 'parent amount not kept, got %', amt; end if;
  begin
    insert into public.stars (track_id, member_id, reason, status, amount) values (ta, a, 'Too many', 'approved', 11);
    raise exception 'amount 11 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.stars (track_id, member_id, reason, status, amount) values (ta, a, 'None', 'approved', 0);
    raise exception 'amount 0 accepted';
  exception when check_violation then null;
  end;
  -- parent with a task: task amount wins
  insert into public.stars (track_id, member_id, reason, status, task_id, amount)
    values (tb, b, 'Read a book', 'approved', kb, 7);
  select amount into amt from public.stars where reason = 'Read a book';
  if amt <> 2 then raise exception 'parent task amount not applied, got %', amt; end if;
  perform pg_temp.done();
end $$;

-- 4. Rewards count the sum of amounts. Track A approved: 3 (Parent gave 3) -> approve the child's
-- 'Tidy room' (3) = 6, so 5 is reachable but 10 is not with only 2 rows.
do $$
declare ta uuid; tb uuid; b uuid; k1 uuid; n int;
begin
  select v into ta from ids where k = 'ta';
  select v into tb from ids where k = 'tb';
  select v into b from ids where k = 'b';
  select v into k1 from ids where k = 'k1';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

  update public.stars set status = 'approved' where reason = 'Tidy room';
  select coalesce(sum(amount), 0) into n from public.stars where track_id = ta and status = 'approved';
  if n <> 6 then raise exception 'approved sum should be 6, was %', n; end if;

  insert into public.rewards (track_id, at_count, kind) values (ta, 5, 'small');
  begin
    insert into public.rewards (track_id, at_count, kind) values (ta, 10, 'big');
    raise exception 'reward at 10 accepted with approved sum 6';
  exception when check_violation then null;
  end;

  -- 4 more via one row of 4 gives 10 with 3 rows
  insert into public.stars (track_id, member_id, reason, status, amount)
    values (ta, (select v from ids where k = 'a'), 'Big help', 'approved', 4);
  select count(*) into n from public.stars where track_id = ta and status = 'approved';
  if n <> 3 then raise exception 'expected 3 approved rows, got %', n; end if;
  insert into public.rewards (track_id, at_count, kind) values (ta, 10, 'big');

  -- pending and declined amounts do not count
  insert into public.stars (track_id, member_id, reason, status, amount) values (tb, b, 'Pending 5', 'pending', 5);
  begin
    insert into public.rewards (track_id, at_count, kind) values (tb, 5, 'small');
    raise exception 'reward accepted with only pending/low stars';
  exception when check_violation then null;
  end;
  perform pg_temp.done();
end $$;

-- 5. Preset reasons become tasks (the migration's insert, re-run on a new track; idempotent).
do $$
declare c uuid; t uuid; n int;
begin
  insert into public.members (name, email, role) values ('Task Child C', 'task.child.c@example.com', 'child') returning id into c;
  insert into public.star_tracks (member_id, name, preset_reasons) values (c, 'Presets', array['One', 'Two', 'Three']) returning id into t;
  perform public.star_tasks_from_presets();
  perform public.star_tasks_from_presets();
  select count(*) into n from public.star_tasks where track_id = t and stars = 1;
  if n <> 3 then raise exception 'expected 3 preset tasks, got %', n; end if;
  if (select sort from public.star_tasks where track_id = t and name = 'Three') <> 2 then
    raise exception 'preset sort wrong';
  end if;
  -- existing tracks without presets get nothing extra
  select count(*) into n from public.star_tasks where track_id = (select v from ids where k = 'ta');
  if n <> 2 then raise exception 'track A tasks changed by presets: %', n; end if;
end $$;

-- 6. school_days and plan_items period/times.
do $$
declare a uuid; b uuid; da uuid; n int;
begin
  select v into a from ids where k = 'a';
  select v into b from ids where k = 'b';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

  insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type)
    values (a, 'ukeplan', 44, 2026, a || '/week.pdf', 'application/pdf') returning id into da;
  insert into public.school_days (document_id, member_id, date, starts_at, ends_at)
    values (da, a, '2026-10-26', '08:15', '14:30');
  insert into public.school_days (document_id, member_id, date) values (da, a, '2026-10-27');

  begin
    insert into public.school_days (document_id, member_id, date) values (da, a, '2026-10-26');
    raise exception 'duplicate school day accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.school_days (document_id, member_id, date) values (da, b, '2026-10-28');
    raise exception 'school_days member mismatch accepted';
  exception when check_violation then null;
  end;

  insert into public.plan_items (document_id, member_id, date, kind, subject, text, period, starts_at, ends_at)
    values (da, a, '2026-10-26', 'lesson', 'Math', 'Fractions', 1, '08:15', '09:00');
  begin
    insert into public.plan_items (document_id, member_id, date, kind, text, period) values (da, a, '2026-10-26', 'lesson', 'x', 0);
    raise exception 'period 0 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.plan_items (document_id, member_id, date, kind, text, period) values (da, a, '2026-10-26', 'lesson', 'x', 16);
    raise exception 'period 16 accepted';
  exception when check_violation then null;
  end;
  perform pg_temp.done();

  -- child: nothing before publish, own rows after, never a sibling's
  perform pg_temp.act_as('task.child.a@example.com', 'authenticated');
  select count(*) into n from public.school_days;
  if n <> 0 then raise exception 'child saw % unpublished school days', n; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  update public.documents set status = 'published' where id = da;
  perform pg_temp.done();

  perform pg_temp.act_as('task.child.a@example.com', 'authenticated');
  select count(*) into n from public.school_days;
  if n <> 2 then raise exception 'child A should see 2 school days, saw %', n; end if;
  begin
    insert into public.school_days (document_id, member_id, date) values (da, a, '2026-10-29');
    raise exception 'child inserted a school day';
  exception when insufficient_privilege then null;
  end;
  update public.school_days set starts_at = '01:00';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child updated % school days', n; end if;
  delete from public.school_days;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child deleted % school days', n; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('task.child.b@example.com', 'authenticated');
  select count(*) into n from public.school_days;
  if n <> 0 then raise exception 'child B saw % school days of A', n; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'anon');
  begin
    perform count(*) from public.school_days;
    raise exception 'anon read school_days';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();
end $$;

rollback;

\echo week_plan_and_tasks_rls: all checks passed
