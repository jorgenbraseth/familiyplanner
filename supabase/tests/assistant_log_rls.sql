-- RLS and trigger tests for assistant_log and its daily limit. Made-up data only.
begin;

insert into public.members (name, email, role) values
  ('Assistant Child A', 'assistant.child.a@example.com', 'child'),
  ('Assistant Child B', 'assistant.child.b@example.com', 'child');

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

-- 1. Child inserts own rows; not for a sibling; shape checks.
do $$
declare a uuid; b uuid; n int;
begin
  select id into a from public.members where email = 'assistant.child.a@example.com';
  select id into b from public.members where email = 'assistant.child.b@example.com';

  perform pg_temp.act_as('assistant.child.a@example.com', 'authenticated');
  insert into public.assistant_log (member_id, question, answer, tools_used)
    values (a, 'What is homework today?', 'Maths page 4.', array['get_plan']);
  insert into public.assistant_log (member_id, question, answer) values (a, 'Empty answer ok?', '');
  begin
    insert into public.assistant_log (member_id, question, answer) values (b, 'As my sibling', 'No');
    raise exception 'child inserted a row for a sibling';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.assistant_log (member_id, question, answer) values (a, '', 'x');
    raise exception 'empty question accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.assistant_log (member_id, question, answer) values (a, repeat('q', 1001), 'x');
    raise exception '1001-char question accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.assistant_log (member_id, question, answer) values (a, 'q', repeat('a', 4001));
    raise exception '4001-char answer accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.assistant_log (member_id, question, answer, tools_used)
      values (a, 'q', 'a', (select array_agg('t' || i) from generate_series(1, 11) i));
    raise exception '11 tools accepted';
  exception when check_violation then null;
  end;
  perform pg_temp.done();

  perform pg_temp.act_as('assistant.child.b@example.com', 'authenticated');
  insert into public.assistant_log (member_id, question, answer) values (b, 'Sibling question', 'Sibling answer');
  perform pg_temp.done();
end $$;

-- 2. Visibility, and no update/delete for children.
do $$
declare n int;
begin
  perform pg_temp.act_as('assistant.child.a@example.com', 'authenticated');
  select count(*) into n from public.assistant_log;
  if n <> 2 then raise exception 'child A should see 2 rows, saw %', n; end if;
  select count(*) into n from public.assistant_log where question = 'Sibling question';
  if n <> 0 then raise exception 'child A saw a sibling row'; end if;
  update public.assistant_log set answer = 'tampered';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child updated % rows', n; end if;
  delete from public.assistant_log;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child deleted % rows', n; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  select count(*) into n from public.assistant_log;
  if n <> 3 then raise exception 'parent should see 3 rows, saw %', n; end if;
  update public.assistant_log set answer = 'tampered';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'parent updated % rows', n; end if;
  perform pg_temp.done();
end $$;

-- 3. assistant_questions_today() counts the caller's own rows.
do $$
declare n int;
begin
  perform pg_temp.act_as('assistant.child.a@example.com', 'authenticated');
  n := public.assistant_questions_today();
  if n <> 2 then raise exception 'child A count should be 2, got %', n; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('assistant.child.b@example.com', 'authenticated');
  n := public.assistant_questions_today();
  if n <> 1 then raise exception 'child B count should be 1, got %', n; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  n := public.assistant_questions_today();
  if n <> 0 then raise exception 'parent count should be 0, got %', n; end if;
  perform pg_temp.done();
end $$;

-- 4. Daily limit: the 31st question of the day fails for a child; parents are unlimited.
do $$
declare a uuid; p uuid; n int;
begin
  select id into a from public.members where email = 'assistant.child.a@example.com';
  select id into p from public.members where email = 'jorgen.braseth@gmail.com';

  perform pg_temp.act_as('assistant.child.a@example.com', 'authenticated');
  for i in 3..30 loop
    insert into public.assistant_log (member_id, question, answer) values (a, 'Question ' || i, 'Answer');
  end loop;
  n := public.assistant_questions_today();
  if n <> 30 then raise exception 'child A count should be 30, got %', n; end if;
  begin
    insert into public.assistant_log (member_id, question, answer) values (a, 'Question 31', 'Answer');
    raise exception '31st question accepted';
  exception when check_violation then
    if sqlerrm <> 'assistant_daily_limit' then raise; end if;
  end;
  perform pg_temp.done();

  -- Rows from yesterday don't count (Copenhagen midnight), via the service role (no member, not limited).
  update public.assistant_log set created_at = created_at - interval '2 days' where member_id = a and question = 'Question 30';
  perform pg_temp.act_as('assistant.child.a@example.com', 'authenticated');
  insert into public.assistant_log (member_id, question, answer) values (a, 'Question 31 after rollover', 'Answer');
  perform pg_temp.done();

  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  for i in 1..35 loop
    insert into public.assistant_log (member_id, question, answer) values (p, 'Parent question ' || i, 'Answer');
  end loop;
  perform pg_temp.done();
end $$;

-- 5. Parent can delete (clear the log); service role is not limited.
do $$
declare n int; a uuid;
begin
  select id into a from public.members where email = 'assistant.child.a@example.com';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  delete from public.assistant_log where member_id = a;
  get diagnostics n = row_count;
  if n <> 31 then raise exception 'parent should delete 31 rows, deleted %', n; end if;
  perform pg_temp.done();

  for i in 1..40 loop
    insert into public.assistant_log (member_id, question, answer) values (a, 'Service ' || i, 'Answer');
  end loop;
end $$;

-- 6. anon sees nothing and can't write.
do $$
declare n int;
begin
  perform pg_temp.act_as('assistant.child.a@example.com', 'anon');
  begin
    select count(*) into n from public.assistant_log;
    raise exception 'anon could read assistant_log';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.assistant_log (member_id, question, answer)
      values ((select id from public.members limit 1), 'q', 'a');
    raise exception 'anon could insert';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.assistant_questions_today();
    raise exception 'anon could call assistant_questions_today';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();
end $$;

rollback;

\echo assistant_log_rls: all checks passed
