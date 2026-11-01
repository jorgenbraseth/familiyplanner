-- Tests for the family screen (members.role = 'screen'). Made-up data only.
begin;

insert into public.members (name, email, role) values
  ('Screen Child A', 'screen.child.a@example.com', 'child'),
  ('Screen Child B', 'screen.child.b@example.com', 'child'),
  ('Family Screen', 'screen.tablet@example.com', 'screen');

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

-- 1. Parent sets up tracks, tasks, routine, a published ukeplan with homework and a parent-only item.
do $$
declare a uuid; b uuid; p uuid; s uuid; ta uuid; tb uuid; ka uuid; ia uuid; ib uuid; doc uuid;
begin
  select id into a from public.members where email = 'screen.child.a@example.com';
  select id into b from public.members where email = 'screen.child.b@example.com';
  select id into s from public.members where email = 'screen.tablet@example.com';
  select id into p from public.members where email = 'jorgen.braseth@gmail.com';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

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

  -- a screen can't own tracks, routine items or settings
  begin
    insert into public.star_tracks (member_id, name) values (s, 'Screen track');
    raise exception 'track for a screen accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.routine_items (member_id, slot, name) values (s, 'morning', 'x');
    raise exception 'routine item for a screen accepted';
  exception when check_violation then null;
  end;

  perform pg_temp.done();
  insert into ids values ('a', a), ('b', b), ('s', s), ('p', p), ('ta', ta), ('tb', tb), ('ka', ka),
    ('ia', ia), ('ib', ib), ('doc', doc);
end $$;

-- 2. Stars: the screen only requests pending stars for children.
do $$
declare a uuid; b uuid; p uuid; s uuid; ta uuid; tb uuid; n int; st record;
begin
  select v into a from ids where k = 'a'; select v into b from ids where k = 'b';
  select v into p from ids where k = 'p'; select v into s from ids where k = 's';
  select v into ta from ids where k = 'ta'; select v into tb from ids where k = 'tb';
  perform pg_temp.act_as('screen.tablet@example.com', 'authenticated');

  if not public.is_screen() or public.is_parent() then raise exception 'is_screen/is_parent wrong'; end if;

  insert into public.stars (track_id, member_id, reason, requested_by) values (ta, a, 'Screen helped', s);
  insert into public.stars (track_id, member_id, reason, requested_by) values (tb, b, 'Screen helped too', s);
  select * into st from public.stars where reason = 'Screen helped';
  if st.status <> 'pending' or st.requested_by <> s or st.amount <> 1 or st.decided_by is not null then
    raise exception 'unexpected screen star %', st;
  end if;

  begin
    insert into public.stars (track_id, member_id, reason, requested_by, status) values (ta, a, 'Auto approved', s, 'approved');
    raise exception 'approved star accepted';
  exception when insufficient_privilege then null;
  end;
  -- decision fields on a pending request are cleared by stars_fill_decision (before the policy check)
  insert into public.stars (track_id, member_id, reason, requested_by, status, decided_by, decided_at)
    values (ta, a, 'Fake decision', s, 'pending', s, now());
  select count(*) into n from public.stars where reason = 'Fake decision' and decided_by is null and decided_at is null;
  if n <> 1 then raise exception 'decision fields not cleared'; end if;
  begin
    insert into public.stars (track_id, member_id, reason, requested_by) values (ta, a, 'Spoofed requester', p);
    raise exception 'star with another requested_by accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    -- track of another child
    insert into public.stars (track_id, member_id, reason, requested_by) values (tb, a, 'Wrong track', s);
    raise exception 'star on another child''s track accepted';
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    insert into public.stars (track_id, member_id, reason, requested_by) values (ta, p, 'For a parent', s);
    raise exception 'star for a parent accepted';
  exception when insufficient_privilege or check_violation then null;
  end;

  -- cannot approve, decline or delete
  update public.stars set status = 'approved' where reason = 'Screen helped';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'screen updated a star'; end if;
  delete from public.stars where reason = 'Screen helped';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'screen deleted a star'; end if;

  -- cannot touch tracks, tasks, rewards, members
  begin
    insert into public.star_tracks (member_id, name) values (a, 'Another');
    raise exception 'screen created a track';
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
  begin
    update public.members set role = 'parent' where email = 'screen.tablet@example.com';
    raise exception 'screen changed its own role';
  exception when insufficient_privilege then null;
  end;

  perform pg_temp.done();
end $$;

-- 3. Routines: tick and untick any child's items today, not other dates; routine star only when complete.
do $$
declare a uuid; b uuid; s uuid; ta uuid; ka uuid; ia uuid; ib uuid; n int;
begin
  select v into a from ids where k = 'a'; select v into b from ids where k = 'b';
  select v into s from ids where k = 's'; select v into ta from ids where k = 'ta';
  select v into ka from ids where k = 'ka'; select v into ia from ids where k = 'ia'; select v into ib from ids where k = 'ib';
  perform pg_temp.act_as('screen.tablet@example.com', 'authenticated');

  -- routine star before everything is checked: refused
  begin
    insert into public.stars (track_id, member_id, reason, requested_by, task_id, routine_slot, routine_date)
      values (ta, a, 'Morgenstell', s, ka, 'morning', public.routine_today());
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
    values (ta, a, 'Morgenstell', s, ka, 'morning', public.routine_today());
  select count(*) into n from public.stars where reason = 'Morgenstell' and status = 'pending' and amount = 3 and requested_by = s;
  if n <> 1 then raise exception 'routine star not pending with task amount'; end if;

  delete from public.routine_checks where item_id = ib;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'screen could not uncheck'; end if;

  perform pg_temp.done();
  -- an old check (made by the owner) cannot be removed by the screen
  insert into public.routine_checks (item_id, member_id, date) values (ib, b, public.routine_today() - 1);
  perform pg_temp.act_as('screen.tablet@example.com', 'authenticated');
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

-- 4. Homework: tick done, nothing else; parent-only items invisible and untouchable.
do $$
declare s uuid; n int; doc uuid;
begin
  select v into s from ids where k = 's'; select v into doc from ids where k = 'doc';
  perform pg_temp.act_as('screen.tablet@example.com', 'authenticated');

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

  -- parent-only / own-only data stays out of reach
  select count(*) into n from public.documents where status <> 'published';
  if n <> 0 then raise exception 'screen reads unpublished documents'; end if;
  begin
    insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type)
      values ((select id from public.members where email = 'screen.child.a@example.com'), 'ukeplan', 1, 2026, 'screen/x.pdf', 'application/pdf');
    raise exception 'screen created a document';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.assistant_log;
  if n <> 0 then raise exception 'screen reads assistant_log'; end if;
  select count(*) into n from public.push_subscriptions;
  if n <> 0 then raise exception 'screen reads push subscriptions'; end if;

  perform pg_temp.done();
end $$;

rollback;

\echo family_screen_rls: all checks passed
