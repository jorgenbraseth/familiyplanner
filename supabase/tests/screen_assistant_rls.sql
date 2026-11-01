-- Tests for the assistant on the family screen: assistant_log.asked_for, the insert rule and the
-- daily limit counting both phone and screen questions. Made-up data only.
begin;

insert into public.members (name, email, role) values
  ('Screen Asst Child A', 'screen.asst.a@example.com', 'child'),
  ('Screen Asst Child B', 'screen.asst.b@example.com', 'child');

create function pg_temp.act_as(p_email text, p_role text, p_session text default null) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_strip_nulls(json_build_object('email', p_email, 'session_id', p_session))::text, true);
  execute format('set local role %I', p_role);
end $$;

create function pg_temp.act_normal() returns void language sql as
  $$ select pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated', '00000000-0000-4000-8000-0000000000a1') $$;
create function pg_temp.act_screen() returns void language sql as
  $$ select pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated', '00000000-0000-4000-8000-0000000000a2') $$;

create function pg_temp.done() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

grant execute on function pg_temp.act_as(text, text, text), pg_temp.act_normal(), pg_temp.act_screen(),
  pg_temp.done() to public;

-- The second session is the tablet.
insert into public.screen_sessions (session_id, member_id)
  select '00000000-0000-4000-8000-0000000000a2', id from public.members where email = 'jorgen.braseth@gmail.com';

-- 1. The screen logs a question as a child and as a parent; the row's member_id stays the parent.
do $$
declare a uuid; b uuid; p uuid; n int;
begin
  select id into a from public.members where email = 'screen.asst.a@example.com';
  select id into b from public.members where email = 'screen.asst.b@example.com';
  select id into p from public.members where email = 'jorgen.braseth@gmail.com';

  perform pg_temp.act_screen();
  if not public.is_screen() then raise exception 'test setup: not a screen session'; end if;
  insert into public.assistant_log (member_id, asked_for, question, answer) values (p, a, 'Screen as A', 'x');
  insert into public.assistant_log (member_id, asked_for, question, answer) values (p, p, 'Screen as parent', 'x');
  -- not as someone else's member_id
  begin
    insert into public.assistant_log (member_id, asked_for, question, answer) values (a, a, 'Spoofed member', 'x');
    raise exception 'screen inserted a row for a child as member_id';
  exception when insufficient_privilege then null;
  end;
  -- not as a nonexistent person
  begin
    insert into public.assistant_log (member_id, asked_for, question, answer)
      values (p, '00000000-0000-4000-8000-0000000000ff', 'Ghost', 'x');
    raise exception 'screen asked as a nonexistent member';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;
  perform pg_temp.done();
end $$;

-- 2. A normal session (parent or child) cannot set asked_for, not even to a valid person or itself.
do $$
declare a uuid; b uuid; p uuid;
begin
  select id into a from public.members where email = 'screen.asst.a@example.com';
  select id into b from public.members where email = 'screen.asst.b@example.com';
  select id into p from public.members where email = 'jorgen.braseth@gmail.com';

  perform pg_temp.act_normal();
  if not public.is_parent() then raise exception 'test setup: not a normal parent session'; end if;
  begin
    insert into public.assistant_log (member_id, asked_for, question, answer) values (p, a, 'Normal as A', 'x');
    raise exception 'normal parent set asked_for to someone else';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.assistant_log (member_id, asked_for, question, answer) values (p, p, 'Normal as self', 'x');
    raise exception 'normal parent set asked_for to self';
  exception when insufficient_privilege then null;
  end;
  insert into public.assistant_log (member_id, question, answer) values (p, 'Normal plain', 'x');
  perform pg_temp.done();

  perform pg_temp.act_as('screen.asst.b@example.com', 'authenticated');
  begin
    insert into public.assistant_log (member_id, asked_for, question, answer) values (b, a, 'Child B as A', 'x');
    raise exception 'child set asked_for to a sibling';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.assistant_log (member_id, asked_for, question, answer) values (b, b, 'Child B as B', 'x');
    raise exception 'child set asked_for';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();
end $$;

-- 3. Counts: the screen reads a child's total (screen + phone); normal sessions only their own.
do $$
declare a uuid; p uuid; n int;
begin
  select id into a from public.members where email = 'screen.asst.a@example.com';
  select id into p from public.members where email = 'jorgen.braseth@gmail.com';

  perform pg_temp.act_as('screen.asst.a@example.com', 'authenticated');
  insert into public.assistant_log (member_id, question, answer) values (a, 'A on phone', 'x');
  n := public.assistant_questions_today();
  if n <> 2 then raise exception 'child A phone count should include the screen question (2), got %', n; end if;
  begin
    perform public.assistant_questions_today(p);
    raise exception 'child asked for the parent''s count';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();

  perform pg_temp.act_screen();
  n := public.assistant_questions_today(a);
  if n <> 2 then raise exception 'screen count for A should be 2, got %', n; end if;
  n := public.assistant_questions_today();
  if n <> 3 then raise exception 'screen own count (parent member_id rows) should be 3, got %', n; end if;
  perform pg_temp.done();

  perform pg_temp.act_normal();
  begin
    perform public.assistant_questions_today(a);
    raise exception 'normal parent session asked for a child''s count';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();
end $$;

-- 4. Limit: 30 per day across phone + screen for child A; the screen is refused for A, still fine for B,
--    parents unlimited on the screen. A child's phone is refused too.
do $$
declare a uuid; b uuid; p uuid; n int;
begin
  select id into a from public.members where email = 'screen.asst.a@example.com';
  select id into b from public.members where email = 'screen.asst.b@example.com';
  select id into p from public.members where email = 'jorgen.braseth@gmail.com';

  perform pg_temp.act_screen();
  for i in 3..30 loop
    insert into public.assistant_log (member_id, asked_for, question, answer) values (p, a, 'Fill ' || i, 'x');
  end loop;
  n := public.assistant_questions_today(a);
  if n <> 30 then raise exception 'count for A should be 30, got %', n; end if;
  begin
    insert into public.assistant_log (member_id, asked_for, question, answer) values (p, a, 'Over the limit', 'x');
    raise exception 'screen question 31 as child A accepted';
  exception when check_violation then
    if sqlerrm <> 'assistant_daily_limit' then raise; end if;
  end;
  insert into public.assistant_log (member_id, asked_for, question, answer) values (p, b, 'Screen as B', 'x');
  for i in 1..35 loop
    insert into public.assistant_log (member_id, asked_for, question, answer) values (p, p, 'Parent ' || i, 'x');
  end loop;
  perform pg_temp.done();

  perform pg_temp.act_as('screen.asst.a@example.com', 'authenticated');
  begin
    insert into public.assistant_log (member_id, question, answer) values (a, 'Phone over the limit', 'x');
    raise exception 'phone question accepted after screen questions used the limit';
  exception when check_violation then null;
  end;
  perform pg_temp.done();

  -- B's phone question counts the screen one asked as B (2 total).
  perform pg_temp.act_as('screen.asst.b@example.com', 'authenticated');
  insert into public.assistant_log (member_id, question, answer) values (b, 'B phone', 'x');
  n := public.assistant_questions_today();
  if n <> 2 then raise exception 'B count should be 2 (screen 1 + phone 1), got %', n; end if;
  perform pg_temp.done();
end $$;

-- 5. Parents' normal session reads all rows including asked_for; the screen only its own member rows.
do $$
declare n int;
begin
  perform pg_temp.act_normal();
  select count(*) into n from public.assistant_log where asked_for is not null and question = 'Screen as A';
  if n <> 1 then raise exception 'parent should see the screen row, saw %', n; end if;
  perform pg_temp.done();
end $$;

rollback;

\echo screen_assistant_rls: all checks passed
