-- Tests for the family screen: a PARENT's auth session put into screen mode (screen_sessions),
-- plus the device lock. Made-up data only.
begin;

insert into public.members (name, email, role) values
  ('Screen Child A', 'screen.child.a@example.com', 'child'),
  ('Screen Child B', 'screen.child.b@example.com', 'child');

-- Session ids: the parent's normal session (phone) and the session that enters screen mode (tablet).
create function pg_temp.act_as(p_email text, p_role text, p_session text default null) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_strip_nulls(json_build_object('email', p_email, 'session_id', p_session))::text, true);
  execute format('set local role %I', p_role);
end $$;

create function pg_temp.act_normal() returns void language sql as
  $$ select pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated', '00000000-0000-4000-8000-000000000001') $$;
create function pg_temp.act_screen() returns void language sql as
  $$ select pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated', '00000000-0000-4000-8000-000000000002') $$;

create function pg_temp.done() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

grant execute on function pg_temp.act_as(text, text, text), pg_temp.act_normal(), pg_temp.act_screen(),
  pg_temp.done() to public;

create temp table ids (k text primary key, v uuid);
grant all on ids to public;

-- 1. Parent (normal session) sets up tracks, tasks, routine, a published ukeplan with homework and a
--    parent-only item, a document in review, and a child's assistant log row.
do $$
declare a uuid; b uuid; p uuid; ta uuid; tb uuid; ka uuid; ia uuid; ib uuid; doc uuid;
begin
  select id into a from public.members where email = 'screen.child.a@example.com';
  select id into b from public.members where email = 'screen.child.b@example.com';
  select id into p from public.members where email = 'jorgen.braseth@gmail.com';
  perform pg_temp.act_normal();

  if not public.is_parent() or public.is_screen() then raise exception 'normal session must be a parent'; end if;

  insert into public.star_tracks (member_id, name, goal, milestone_every) values (a, 'Screen A', 10, 5) returning id into ta;
  insert into public.star_tracks (member_id, name, goal, milestone_every) values (b, 'Screen B', 10, 5) returning id into tb;
  insert into public.star_tasks (member_id, name, stars) values (a, 'Screen morning done', 3) returning id into ka;
  insert into public.routine_items (member_id, slot, name) values (a, 'morning', 'Screen teeth') returning id into ia;
  insert into public.routine_items (member_id, slot, name) values (b, 'morning', 'Screen bag') returning id into ib;
  insert into public.routine_settings (member_id, slot, star_task_id) values (a, 'morning', ka);

  insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type, status)
    values (a, 'ukeplan', 44, 2026, 'screen/a/doc.pdf', 'application/pdf', 'published') returning id into doc;
  insert into public.plan_items (document_id, member_id, date, kind, text, audience) values
    (doc, a, '2026-10-26', 'homework', 'Screen homework', 'both'),
    (doc, a, '2026-10-26', 'message', 'Screen parent only', 'parent');
  insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type, status)
    values (a, 'ukeplan', 45, 2026, 'screen/a/review.pdf', 'application/pdf', 'review');

  -- a pending star (made by the owner) and an approved one, to attack from the screen
  insert into public.stars (track_id, member_id, reason, requested_by, status)
    values (ta, a, 'Screen pending owner', p, 'pending');
  insert into public.stars (track_id, member_id, reason, requested_by, status)
    values (ta, a, 'Screen approved owner', p, 'approved');

  perform pg_temp.done();
  insert into public.assistant_log (member_id, question, answer) values (a, 'Screen child question', 'x');
  insert into ids values ('a', a), ('b', b), ('p', p), ('ta', ta), ('tb', tb), ('ka', ka),
    ('ia', ia), ('ib', ib), ('doc', doc);
end $$;

-- 2. Entering screen mode: parents only, idempotent, no claim -> refused, child refused.
do $$
declare n int; sid uuid := '00000000-0000-4000-8000-000000000002';
begin
  -- no session_id claim
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  begin
    perform public.enter_screen_mode();
    raise exception 'entered screen mode without a session_id';
  exception when insufficient_privilege then null;
  end;
  -- invalid session_id claim
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated', 'not-a-uuid');
  begin
    perform public.enter_screen_mode();
    raise exception 'entered screen mode with a bad session_id';
  exception when insufficient_privilege then null;
  end;
  if public.current_session_is_screen() then raise exception 'bad claim counts as screen'; end if;

  -- a child cannot
  perform pg_temp.act_as('screen.child.a@example.com', 'authenticated', '00000000-0000-4000-8000-000000000003');
  begin
    perform public.enter_screen_mode();
    raise exception 'a child entered screen mode';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();

  -- anon cannot call it at all
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'anon', '00000000-0000-4000-8000-000000000009');
  begin
    perform public.enter_screen_mode();
    raise exception 'anon entered screen mode';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();

  -- the parent's normal session is untouched until it enters
  perform pg_temp.act_normal();
  if public.current_session_is_screen() or not public.is_parent() then raise exception 'normal session changed too early'; end if;

  perform pg_temp.act_screen();
  perform public.enter_screen_mode();
  perform public.enter_screen_mode(); -- idempotent
  if not public.is_screen() or public.is_parent() or not public.current_session_is_screen() then
    raise exception 'screen session: is_screen/is_parent wrong';
  end if;
  select count(*) into n from public.screen_sessions;
  if n <> 1 then raise exception 'screen session rows: %', n; end if;

  -- the screen session cannot delete, update or insert screen_sessions rows
  begin
    delete from public.screen_sessions;
    raise exception 'screen deleted its screen_sessions row';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.screen_sessions (session_id, member_id)
      values (gen_random_uuid(), (select id from public.members where email = 'jorgen.braseth@gmail.com'));
    raise exception 'screen inserted a screen_sessions row';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.screen_sessions set created_at = now();
    raise exception 'screen updated a screen_sessions row';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();

  -- the parent's normal session keeps every right, and does not see the screen row of another session
  perform pg_temp.act_normal();
  if not public.is_parent() or public.is_screen() then raise exception 'normal session lost parent rights'; end if;
  select count(*) into n from public.members;
  if n < 3 then raise exception 'parent cannot read members'; end if;
  perform pg_temp.done();
end $$;

-- 3. Parent in a normal session keeps all rights (even though a screen session exists).
do $$
declare a uuid; ta uuid; n int; sid uuid;
begin
  select v into a from ids where k = 'a'; select v into ta from ids where k = 'ta';
  perform pg_temp.act_normal();
  update public.stars set status = 'approved' where reason = 'Screen pending owner';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'normal parent cannot approve'; end if;
  update public.stars set status = 'pending' where reason = 'Screen pending owner';
  insert into public.members (name, email, role) values ('Screen Extra', 'screen.extra@example.com', 'child');
  update public.members set name = 'Screen Extra 2' where email = 'screen.extra@example.com';
  delete from public.members where email = 'screen.extra@example.com';
  select count(*) into n from public.documents where status = 'review';
  if n <> 1 then raise exception 'normal parent cannot read documents in review'; end if;
  perform pg_temp.done();
end $$;

-- 4. Stars: the screen session only requests pending stars for children.
do $$
declare a uuid; b uuid; p uuid; ta uuid; tb uuid; n int; st record;
begin
  select v into a from ids where k = 'a'; select v into b from ids where k = 'b';
  select v into p from ids where k = 'p';
  select v into ta from ids where k = 'ta'; select v into tb from ids where k = 'tb';
  perform pg_temp.act_screen();

  insert into public.stars (track_id, member_id, reason, requested_by) values (ta, a, 'Screen helped', p);
  insert into public.stars (track_id, member_id, reason, requested_by) values (tb, b, 'Screen helped too', p);
  select * into st from public.stars where reason = 'Screen helped';
  if st.status <> 'pending' or st.requested_by <> p or st.amount <> 1 or st.decided_by is not null then
    raise exception 'unexpected screen star %', st;
  end if;

  begin
    insert into public.stars (track_id, member_id, reason, requested_by, status) values (ta, a, 'Auto approved', p, 'approved');
    raise exception 'approved star accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    -- a bigger amount is reset to 1 for a non-parent request; an approved/given amount never sticks
    insert into public.stars (track_id, member_id, reason, requested_by, amount) values (ta, a, 'Screen ten', p, 10);
    select count(*) into n from public.stars where reason = 'Screen ten' and amount = 1 and status = 'pending';
    if n <> 1 then raise exception 'screen star amount not forced to 1'; end if;
  end;
  -- decision fields on a pending request are cleared by stars_fill_decision (before the policy check)
  insert into public.stars (track_id, member_id, reason, requested_by, status, decided_by, decided_at)
    values (ta, a, 'Fake decision', p, 'pending', p, now());
  select count(*) into n from public.stars where reason = 'Fake decision' and decided_by is null and decided_at is null;
  if n <> 1 then raise exception 'decision fields not cleared'; end if;
  begin
    insert into public.stars (track_id, member_id, reason, requested_by) values (ta, a, 'Spoofed requester', b);
    raise exception 'star with another requested_by accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.stars (track_id, member_id, reason, requested_by) values (tb, a, 'Wrong track', p);
    raise exception 'star on another child''s track accepted';
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    insert into public.stars (track_id, member_id, reason, requested_by) values (ta, p, 'For a parent', p);
    raise exception 'star for a parent accepted';
  exception when insufficient_privilege or check_violation then null;
  end;

  -- cannot approve, decline, give, update or delete
  update public.stars set status = 'approved' where reason = 'Screen helped';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'screen approved a star'; end if;
  update public.stars set status = 'declined' where reason = 'Screen pending owner';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'screen declined a star'; end if;
  update public.stars set reason = 'Changed' where reason = 'Screen helped';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'screen updated a star'; end if;
  delete from public.stars where reason in ('Screen helped', 'Screen approved owner');
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'screen deleted a star'; end if;
  begin
    -- "give" = a parent-made approved star
    insert into public.stars (track_id, member_id, reason, requested_by, status, amount)
      values (ta, a, 'Screen gave', p, 'approved', 5);
    raise exception 'screen gave stars';
  exception when insufficient_privilege then null;
  end;

  -- cannot touch tracks, tasks, rewards, members, documents
  begin
    insert into public.star_tracks (member_id, name) values (a, 'Another');
    raise exception 'screen created a track';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.star_tasks (member_id, name, stars) values (a, 'Another task', 2);
    raise exception 'screen created a task';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.rewards (track_id, at_count, kind) values (ta, 5, 'small');
    raise exception 'screen gave a reward';
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    insert into public.members (name, email, role) values ('Intruder', 'intruder@example.com', 'parent');
    raise exception 'screen created a member';
  exception when insufficient_privilege then null;
  end;
  update public.members set name = 'Renamed' where id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'screen updated another member'; end if;
  begin
    update public.members set role = 'child' where id = p;
    raise exception 'screen changed its own role';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.members set name = 'Self rename' where id = p;
    raise exception 'screen renamed its own member row';
  exception when insufficient_privilege then null;
  end;
  delete from public.members where id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'screen deleted a member'; end if;

  perform pg_temp.done();
end $$;

-- 5. Routines: tick and untick any child's items today, not other dates; routine star only when complete.
do $$
declare a uuid; b uuid; p uuid; ta uuid; ka uuid; ia uuid; ib uuid; n int;
begin
  select v into a from ids where k = 'a'; select v into b from ids where k = 'b';
  select v into p from ids where k = 'p'; select v into ta from ids where k = 'ta';
  select v into ka from ids where k = 'ka'; select v into ia from ids where k = 'ia'; select v into ib from ids where k = 'ib';
  perform pg_temp.act_screen();

  -- routine star before everything is checked: refused
  begin
    insert into public.stars (track_id, member_id, reason, requested_by, task_id, routine_slot, routine_date)
      values (ta, a, 'Morgenstell', p, ka, 'morning', public.routine_today());
    raise exception 'routine star accepted before routine complete';
  exception when check_violation then null;
  end;

  insert into public.routine_checks (item_id, member_id, date) values (ia, a, public.routine_today());
  insert into public.routine_checks (item_id, member_id, date) values (ib, b, public.routine_today());

  begin
    insert into public.routine_checks (item_id, member_id, date) values (ia, a, public.routine_today() - 1);
    raise exception 'check for yesterday accepted';
  exception when insufficient_privilege then null;
  end;

  insert into public.stars (track_id, member_id, reason, requested_by, task_id, routine_slot, routine_date)
    values (ta, a, 'Morgenstell', p, ka, 'morning', public.routine_today());
  select count(*) into n from public.stars where reason = 'Morgenstell' and status = 'pending' and amount = 3 and requested_by = p;
  if n <> 1 then raise exception 'routine star not pending with task amount'; end if;

  delete from public.routine_checks where item_id = ib;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'screen could not uncheck'; end if;

  perform pg_temp.done();
  -- an old check (made by the owner) cannot be removed by the screen
  insert into public.routine_checks (item_id, member_id, date) values (ib, b, public.routine_today() - 1);
  perform pg_temp.act_screen();
  delete from public.routine_checks where item_id = ib and date = public.routine_today() - 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'screen removed an old check'; end if;

  begin
    insert into public.routine_items (member_id, slot, name) values (a, 'evening', 'x');
    raise exception 'screen created a routine item';
  exception when insufficient_privilege then null;
  end;

  perform pg_temp.done();
end $$;

-- 6. Homework: tick done, nothing else; parent-only items, documents in review and logs stay out of reach.
do $$
declare n int; a uuid;
begin
  select v into a from ids where k = 'a';
  perform pg_temp.act_screen();

  select count(*) into n from public.plan_items where text = 'Screen parent only';
  if n <> 0 then raise exception 'screen reads a parent-audience item'; end if;
  select count(*) into n from public.plan_items where text = 'Screen homework';
  if n <> 1 then raise exception 'screen cannot read homework'; end if;

  update public.plan_items set done = true where text = 'Screen homework';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'screen could not tick homework'; end if;
  update public.plan_items set done = false where text = 'Screen homework';

  begin
    update public.plan_items set text = 'Changed' where text = 'Screen homework';
    raise exception 'screen changed homework text';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.plan_items set done = true, audience = 'parent' where text = 'Screen homework';
    raise exception 'screen changed homework audience';
  exception when insufficient_privilege then null;
  end;

  update public.plan_items set done = true where text = 'Screen parent only';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'screen ticked a parent-audience item'; end if;

  select count(*) into n from public.documents where status <> 'published';
  if n <> 0 then raise exception 'screen reads documents in review'; end if;
  begin
    insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type)
      values (a, 'ukeplan', 1, 2026, 'screen/x.pdf', 'application/pdf');
    raise exception 'screen created a document';
  exception when insufficient_privilege then null;
  end;
  update public.documents set status = 'review' where status = 'published';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'screen updated a document'; end if;

  select count(*) into n from public.assistant_log where question = 'Screen child question';
  if n <> 0 then raise exception 'screen reads others'' assistant_log'; end if;
  select count(*) into n from public.push_subscriptions;
  if n <> 0 then raise exception 'screen reads push subscriptions'; end if;

  perform pg_temp.done();
end $$;

-- 7. The device lock is gone: the table and its functions no longer exist.
do $$
begin
  if to_regclass('public.screen_devices') is not null then raise exception 'screen_devices still exists'; end if;
  if to_regprocedure('public.register_screen_device()') is not null then raise exception 'register_screen_device still exists'; end if;
  if to_regprocedure('public.screen_device_locked(uuid)') is not null then raise exception 'screen_device_locked still exists'; end if;
  if to_regprocedure('public.screen_devices_release()') is not null then raise exception 'screen_devices_release still exists'; end if;
end $$;

rollback;

\echo family_screen_rls: all checks passed
