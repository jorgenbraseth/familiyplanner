-- Family-wide reads: any family member reads school/star/routine data of the others, but not
-- parent-only data, and changes only their own rows. Made-up data only.
begin;

insert into public.members (name, email, role) values
  ('Family Child A', 'family.child.a@example.com', 'child'),
  ('Family Child B', 'family.child.b@example.com', 'child');

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

-- Setup as a parent: B has a published timeplan + ukeplan, a track with stars, routines; and a
-- ukeplan in review.
do $$
declare
  a uuid; b uuid; tp uuid; uk uuid; rv uuid; tr uuid; task uuid; item uuid;
begin
  select id into a from public.members where email = 'family.child.a@example.com';
  select id into b from public.members where email = 'family.child.b@example.com';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

  insert into public.documents (member_id, type, file_path, mime_type, status)
    values (b, 'timeplan', b || '/time.pdf', 'application/pdf', 'published') returning id into tp;
  insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type, status)
    values (b, 'ukeplan', 44, 2026, b || '/uke.pdf', 'application/pdf', 'published') returning id into uk;
  insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type, status)
    values (b, 'ukeplan', 45, 2026, b || '/uke2.pdf', 'application/pdf', 'review') returning id into rv;

  insert into public.timetable_days (document_id, member_id, weekday, starts_at, ends_at) values (tp, b, 1, '08:15', '14:30');
  insert into public.timetable_periods (document_id, member_id, weekday, period, starts_at, ends_at, subject)
    values (tp, b, 1, 1, '08:15', '09:00', 'Math');
  insert into public.school_days (document_id, member_id, date, starts_at, ends_at) values (uk, b, '2026-10-27', '08:15', '12:00');

  insert into public.plan_items (document_id, member_id, date, kind, text, audience) values
    (uk, b, '2026-10-27', 'homework', 'Read chapter 3', 'both'),
    (uk, b, '2026-10-27', 'message', 'Bring swimming kit', 'child'),
    (uk, b, '2026-10-27', 'message', 'Parent only: pay for the trip', 'parent'),
    (rv, b, '2026-11-03', 'homework', 'Item in review', 'both');

  insert into public.star_tracks (member_id, name, goal, milestone_every, small_reward, big_reward)
    values (b, 'Reading', 10, 5, 'Ice cream', 'Zoo') returning id into tr;
  insert into public.star_tasks (member_id, name, stars) values (b, 'Read 20 minutes', 2) returning id into task;
  insert into public.stars (track_id, member_id, reason, status, decided_by, decided_at)
    select tr, b, 'Read ' || i, 'approved', (select id from public.members where email = 'jorgen.braseth@gmail.com'), now()
    from generate_series(1, 5) i;
  insert into public.rewards (track_id, at_count, kind) values (tr, 5, 'small');

  insert into public.routine_items (member_id, slot, name) values (b, 'morning', 'Brush teeth') returning id into item;
  insert into public.routine_settings (member_id, slot, star_task_id) values (b, 'morning', task);
  insert into public.routine_checks (item_id, member_id, date) values (item, b, public.routine_today());

  perform pg_temp.done();
  perform pg_temp.act_as('family.child.b@example.com', 'authenticated');
  insert into public.assistant_log (member_id, question, answer) values (b, 'Secret question', 'Answer');
  perform pg_temp.done();
  insert into ids values ('a', a), ('b', b), ('tr', tr), ('item', item), ('uk', uk), ('rv', rv), ('task', task);
end $$;

-- 1. Child A reads B's published school data and star data.
do $$
declare a uuid; b uuid; n int;
begin
  select v into a from ids where k = 'a';
  select v into b from ids where k = 'b';
  perform pg_temp.act_as('family.child.a@example.com', 'authenticated');

  select count(*) into n from public.members;
  if n < 3 then raise exception 'child should read all members, saw %', n; end if;

  select count(*) into n from public.timetable_days where member_id = b;
  if n <> 1 then raise exception 'child A should read B timetable_days, saw %', n; end if;
  select count(*) into n from public.timetable_periods where member_id = b;
  if n <> 1 then raise exception 'child A should read B timetable_periods, saw %', n; end if;
  select count(*) into n from public.school_days where member_id = b;
  if n <> 1 then raise exception 'child A should read B school_days, saw %', n; end if;
  if public.active_timeplan_document(b) is null then raise exception 'child A cannot find B active timeplan'; end if;

  select count(*) into n from public.documents where member_id = b;
  if n <> 2 then raise exception 'child A should see 2 published documents of B, saw %', n; end if;
  select count(*) into n from public.documents where member_id = b and status <> 'published';
  if n <> 0 then raise exception 'child A saw an unpublished document'; end if;

  select count(*) into n from public.plan_items where member_id = b and audience in ('child', 'both');
  if n <> 2 then raise exception 'child A should read 2 published child/both items of B, saw %', n; end if;

  select count(*) into n from public.star_tracks where member_id = b;
  if n <> 1 then raise exception 'child A should read B star track'; end if;
  select count(*) into n from public.stars where member_id = b;
  if n <> 5 then raise exception 'child A should read B stars, saw %', n; end if;
  select count(*) into n from public.rewards;
  if n <> 1 then raise exception 'child A should read B rewards'; end if;
  select count(*) into n from public.star_tasks where member_id = b;
  if n <> 1 then raise exception 'child A should read B star tasks'; end if;

  select count(*) into n from public.routine_items where member_id = b;
  if n <> 1 then raise exception 'child A should read B routine items'; end if;
  select count(*) into n from public.routine_settings where member_id = b;
  if n <> 1 then raise exception 'child A should read B routine settings'; end if;
  select count(*) into n from public.routine_checks where member_id = b;
  if n <> 1 then raise exception 'child A should read B routine checks'; end if;
  perform pg_temp.done();
end $$;

-- 2. What stays hidden from child A.
do $$
declare b uuid; n int;
begin
  select v into b from ids where k = 'b';
  perform pg_temp.act_as('family.child.a@example.com', 'authenticated');

  select count(*) into n from public.plan_items where audience = 'parent';
  if n <> 0 then raise exception 'child A saw parent-audience items'; end if;
  select count(*) into n from public.plan_items where document_id = (select v from ids where k = 'rv');
  if n <> 0 then raise exception 'child A saw items of a document in review'; end if;
  select count(*) into n from public.documents where status = 'review';
  if n <> 0 then raise exception 'child A saw a document in review'; end if;
  select count(*) into n from public.assistant_log where member_id = b;
  if n <> 0 then raise exception 'child A saw the assistant log of B'; end if;
  perform pg_temp.done();
end $$;

-- 3. Child A cannot change B's rows (or create rows for B).
do $$
declare a uuid; b uuid; tr uuid; item uuid; n int;
begin
  select v into a from ids where k = 'a';
  select v into b from ids where k = 'b';
  select v into tr from ids where k = 'tr';
  select v into item from ids where k = 'item';
  perform pg_temp.act_as('family.child.a@example.com', 'authenticated');

  update public.plan_items set done = true where member_id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child A ticked off % items of B', n; end if;

  update public.star_tracks set goal = 20 where member_id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child A updated B track'; end if;
  update public.stars set status = 'declined' where member_id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child A updated B stars'; end if;
  delete from public.stars where member_id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child A deleted B stars'; end if;
  delete from public.routine_checks where member_id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child A deleted B routine checks'; end if;
  update public.star_tasks set stars = 10;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child A updated star tasks'; end if;
  update public.members set name = 'Hacked' where id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child A renamed B'; end if;

  begin
    insert into public.stars (track_id, member_id, reason, requested_by) values (tr, b, 'For my sibling', a);
    raise exception 'child A requested a star for B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.routine_checks (item_id, member_id, date) values (item, b, public.routine_today() - 1);
    raise exception 'child A inserted a routine check for B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.routine_items (member_id, slot, name) values (b, 'evening', 'Nope');
    raise exception 'child A inserted a routine item for B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.documents (member_id, type, file_path, mime_type) values (b, 'timeplan', b || '/x.pdf', 'application/pdf');
    raise exception 'child A inserted a document for B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.timetable_days (document_id, member_id, weekday) values ((select v from ids where k = 'uk'), b, 3);
    raise exception 'child A inserted a timetable row for B';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();
end $$;

-- 4. A stranger (signed in, not in members) reads nothing.
do $$
declare t text; n int;
begin
  perform pg_temp.act_as('stranger@example.com', 'authenticated');
  foreach t in array array['members', 'documents', 'plan_items', 'timetable_days', 'timetable_periods', 'school_days',
                           'star_tracks', 'stars', 'rewards', 'star_tasks', 'routine_items', 'routine_settings',
                           'routine_checks', 'assistant_log']
  loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then raise exception 'stranger read % rows of %', n, t; end if;
  end loop;
  perform pg_temp.done();
end $$;

-- 5. A parent still reads everything, including parent items and items in review.
do $$
declare n int;
begin
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  select count(*) into n from public.plan_items;
  if n <> 4 then raise exception 'parent should see 4 items, saw %', n; end if;
  perform pg_temp.done();
end $$;

rollback;

\echo family_wide_reads_rls: all checks passed
