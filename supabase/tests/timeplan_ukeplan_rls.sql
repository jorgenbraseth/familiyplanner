-- Tests for the two document types (timeplan/ukeplan), plan item audience, timetable tables and
-- active_timeplan_document. Made-up data only.
begin;

insert into public.members (name, email, role) values
  ('Plan Child A', 'plan.child.a@example.com', 'child'),
  ('Plan Child B', 'plan.child.b@example.com', 'child');

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

-- 1. Document type and week constraints.
do $$
declare a uuid; b uuid; n int;
begin
  select id into a from public.members where email = 'plan.child.a@example.com';
  select id into b from public.members where email = 'plan.child.b@example.com';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

  insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type)
    values (a, 'ukeplan', 44, 2026, a || '/uke.pdf', 'application/pdf');
  insert into public.documents (member_id, type, file_path, mime_type)
    values (a, 'timeplan', a || '/time.pdf', 'application/pdf');

  begin
    insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type)
      values (a, 'week_schedule', 44, 2026, a || '/old1.pdf', 'application/pdf');
    raise exception 'old type week_schedule accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type)
      values (a, 'homework', 44, 2026, a || '/old2.pdf', 'application/pdf');
    raise exception 'old type homework accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type)
      values (a, 'timeplan', 44, 2026, a || '/bad1.pdf', 'application/pdf');
    raise exception 'timeplan with a week accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.documents (member_id, type, file_path, mime_type)
      values (a, 'ukeplan', a || '/bad2.pdf', 'application/pdf');
    raise exception 'ukeplan without a week accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.documents (member_id, type, iso_week, file_path, mime_type)
      values (a, 'ukeplan', 44, a || '/bad3.pdf', 'application/pdf');
    raise exception 'ukeplan without a year accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type)
      values (a, 'ukeplan', 54, 2026, a || '/bad4.pdf', 'application/pdf');
    raise exception 'week 54 accepted';
  exception when check_violation then null;
  end;

  select count(*) into n from public.documents;
  if n <> 2 then raise exception 'expected 2 documents, saw %', n; end if;
  perform pg_temp.done();
  insert into ids values ('a', a), ('b', b);
end $$;

-- 2. Audience: parent-only items are invisible to the child and cannot be ticked off.
do $$
declare a uuid; doc uuid; n int; kinds text[];
begin
  select v into a from ids where k = 'a';
  select id into doc from public.documents where member_id = a and type = 'ukeplan';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

  insert into public.plan_items (document_id, member_id, date, kind, text, audience, whole_week) values
    (doc, a, '2026-10-26', 'message', 'Parent only: pay for the trip', 'parent', false),
    (doc, a, '2026-10-26', 'message', 'Bring swimming kit', 'child', false),
    (doc, a, '2026-10-26', 'message', 'Parents meeting on Thursday', 'both', false),
    (doc, a, '2026-10-26', 'homework', 'Read chapter 3 this week', 'both', true),
    (doc, a, '2026-10-28', 'event', 'Class trip', 'both', false),
    (doc, a, '2026-10-29', 'homework', 'Parent-only homework note', 'parent', false);
  insert into public.plan_items (document_id, member_id, date, kind, text, starts_at, ends_at)
    values (doc, a, '2026-10-28', 'event', 'Concert', '18:00', '19:30');
  insert into public.plan_items (document_id, member_id, date, kind, text) values (doc, a, '2026-10-30', 'event', 'No time');

  begin
    insert into public.plan_items (document_id, member_id, date, kind, text, audience)
      values (doc, a, '2026-10-26', 'message', 'x', 'everyone');
    raise exception 'bad audience accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.plan_items (document_id, member_id, date, kind, text) values (doc, a, '2026-10-26', 'bring', 'x');
    raise exception 'old kind bring accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.plan_items (document_id, member_id, date, kind, text) values (doc, a, '2026-10-26', 'note', 'x');
    raise exception 'old kind note accepted';
  exception when check_violation then null;
  end;

  -- default audience is both, whole_week false
  select count(*) into n from public.plan_items where kind = 'event' and text = 'No time' and audience = 'both' and not whole_week;
  if n <> 1 then raise exception 'defaults wrong'; end if;

  select count(*) into n from public.plan_items;
  if n <> 8 then raise exception 'parent should see 8 items, saw %', n; end if;
  perform pg_temp.done();

  -- not published: the child sees nothing
  perform pg_temp.act_as('plan.child.a@example.com', 'authenticated');
  select count(*) into n from public.plan_items;
  if n <> 0 then raise exception 'child saw % unpublished items', n; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  update public.documents set status = 'published' where id = doc;
  perform pg_temp.done();

  perform pg_temp.act_as('plan.child.a@example.com', 'authenticated');
  select count(*) into n from public.plan_items;
  if n <> 6 then raise exception 'child should see 6 items, saw %', n; end if;
  select count(*) into n from public.plan_items where audience = 'parent';
  if n <> 0 then raise exception 'child saw parent-only items'; end if;
  select array_agg(distinct audience order by audience) into kinds from public.plan_items;
  if kinds <> array['both', 'child'] then raise exception 'unexpected audiences %', kinds; end if;

  -- ticking off: allowed on child/both items, a no-op (0 rows) on parent-only ones
  update public.plan_items set done = true where text = 'Bring swimming kit';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'child could not tick off own item'; end if;
  update public.plan_items set done = true where audience = 'parent';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child ticked off % parent-only items', n; end if;
  -- cannot move an item to parent-only
  begin
    update public.plan_items set audience = 'parent' where text = 'Bring swimming kit';
    raise exception 'child changed audience';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();

  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  select count(*) into n from public.plan_items where done;
  if n <> 1 then raise exception 'exactly one item should be done, got %', n; end if;
  perform pg_temp.done();

  -- sibling reads the child/both items (family-wide reads), never the parent-only ones, and changes none
  perform pg_temp.act_as('plan.child.b@example.com', 'authenticated');
  select count(*) into n from public.plan_items;
  if n <> 6 then raise exception 'child B should read 6 items of A, saw %', n; end if;
  select count(*) into n from public.plan_items where audience = 'parent';
  if n <> 0 then raise exception 'child B saw parent-only items'; end if;
  update public.plan_items set done = false;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child B updated % items of A', n; end if;
  perform pg_temp.done();
end $$;

-- 3. Timetable rows: hidden until the timeplan is published, member must match, sibling isolation.
do $$
declare a uuid; b uuid; tp uuid; n int;
begin
  select v into a from ids where k = 'a';
  select v into b from ids where k = 'b';
  select id into tp from public.documents where member_id = a and type = 'timeplan';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

  insert into public.timetable_days (document_id, member_id, weekday, starts_at, ends_at) values
    (tp, a, 1, '08:15', '14:30'),
    (tp, a, 2, '08:15', '13:45');
  insert into public.timetable_periods (document_id, member_id, weekday, period, starts_at, ends_at, subject, sort) values
    (tp, a, 1, 1, '08:15', '09:00', 'Math', 0),
    (tp, a, 1, 2, '09:10', '09:55', 'Norwegian', 1),
    (tp, a, 2, null, '08:15', '09:00', 'Gym', 0);

  begin
    insert into public.timetable_days (document_id, member_id, weekday) values (tp, a, 1);
    raise exception 'duplicate weekday accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.timetable_days (document_id, member_id, weekday) values (tp, a, 0);
    raise exception 'weekday 0 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.timetable_days (document_id, member_id, weekday) values (tp, a, 8);
    raise exception 'weekday 8 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.timetable_days (document_id, member_id, weekday) values (tp, b, 3);
    raise exception 'timetable_days member mismatch accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.timetable_periods (document_id, member_id, weekday, subject) values (tp, b, 3, 'Art');
    raise exception 'timetable_periods member mismatch accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.timetable_periods (document_id, member_id, weekday, subject) values (tp, a, 3, '');
    raise exception 'empty subject accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.timetable_periods (document_id, member_id, weekday, subject) values (tp, a, 3, repeat('x', 101));
    raise exception '101-char subject accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.timetable_periods (document_id, member_id, weekday, period, subject) values (tp, a, 3, 16, 'Art');
    raise exception 'period 16 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.timetable_periods (document_id, member_id, weekday, period, subject) values (tp, a, 3, 0, 'Art');
    raise exception 'period 0 accepted';
  exception when check_violation then null;
  end;
  -- moving a row to another member's document is also checked
  begin
    update public.timetable_days set member_id = b where document_id = tp and weekday = 1;
    raise exception 'timetable_days reassigned to another member';
  exception when check_violation then null;
  end;
  perform pg_temp.done();

  perform pg_temp.act_as('plan.child.a@example.com', 'authenticated');
  select count(*) into n from public.timetable_days;
  if n <> 0 then raise exception 'child saw % unpublished timetable days', n; end if;
  select count(*) into n from public.timetable_periods;
  if n <> 0 then raise exception 'child saw % unpublished periods', n; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  update public.documents set status = 'published' where id = tp;
  perform pg_temp.done();

  perform pg_temp.act_as('plan.child.a@example.com', 'authenticated');
  select count(*) into n from public.timetable_days where member_id = (select v from ids where k = 'a');
  if n <> 2 then raise exception 'child A should see 2 days, saw %', n; end if;
  select count(*) into n from public.timetable_periods where member_id = (select v from ids where k = 'a');
  if n <> 3 then raise exception 'child A should see 3 periods, saw %', n; end if;
  begin
    insert into public.timetable_days (document_id, member_id, weekday) values (tp, a, 5);
    raise exception 'child inserted a timetable day';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.timetable_periods (document_id, member_id, weekday, subject) values (tp, a, 5, 'Art');
    raise exception 'child inserted a period';
  exception when insufficient_privilege then null;
  end;
  update public.timetable_periods set subject = 'Hacked';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child updated % periods', n; end if;
  delete from public.timetable_days;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child deleted % days', n; end if;
  delete from public.timetable_periods;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child deleted % periods', n; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('plan.child.b@example.com', 'authenticated');
  select count(*) into n from public.timetable_days;
  if n <> 2 then raise exception 'child B should read the 2 days of A, saw %', n; end if;
  select count(*) into n from public.timetable_periods;
  if n <> 3 then raise exception 'child B should read the 3 periods of A, saw %', n; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('stranger@example.com', 'authenticated');
  select count(*) into n from public.timetable_days;
  if n <> 0 then raise exception 'stranger saw timetable days'; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'anon');
  begin
    perform count(*) from public.timetable_days;
    raise exception 'anon read timetable_days';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.timetable_periods;
    raise exception 'anon read timetable_periods';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.active_timeplan_document(a);
    raise exception 'anon called active_timeplan_document';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();

  -- deleting the document removes its timetable rows
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  insert into public.documents (member_id, type, file_path, mime_type, status)
    values (a, 'timeplan', a || '/tmp.pdf', 'application/pdf', 'review') returning id into tp;
  insert into public.timetable_days (document_id, member_id, weekday) values (tp, a, 4);
  delete from public.documents where id = tp;
  select count(*) into n from public.timetable_days where weekday = 4;
  if n <> 0 then raise exception 'timetable rows survived document delete'; end if;
  perform pg_temp.done();
end $$;

-- 4. active_timeplan_document picks the latest published timeplan of the member.
do $$
declare a uuid; b uuid; first_tp uuid; second_tp uuid; draft_tp uuid; got uuid;
begin
  select v into a from ids where k = 'a';
  select v into b from ids where k = 'b';
  select id into first_tp from public.documents where member_id = a and type = 'timeplan' and status = 'published';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

  if public.active_timeplan_document(a) is distinct from first_tp then
    raise exception 'active timeplan should be the only published one';
  end if;
  if public.active_timeplan_document(b) is not null then
    raise exception 'child B has no timeplan';
  end if;

  -- a newer draft does not count; a newer published one does
  insert into public.documents (member_id, type, file_path, mime_type, status, created_at)
    values (a, 'timeplan', a || '/draft.pdf', 'application/pdf', 'review', now() + interval '1 hour')
    returning id into draft_tp;
  if public.active_timeplan_document(a) is distinct from first_tp then
    raise exception 'a draft timeplan became active';
  end if;
  insert into public.documents (member_id, type, file_path, mime_type, status, created_at)
    values (a, 'timeplan', a || '/second.pdf', 'application/pdf', 'published', now() + interval '2 hours')
    returning id into second_tp;
  if public.active_timeplan_document(a) is distinct from second_tp then
    raise exception 'latest published timeplan not active';
  end if;
  -- an older published one does not override
  insert into public.documents (member_id, type, file_path, mime_type, status, created_at)
    values (a, 'timeplan', a || '/older.pdf', 'application/pdf', 'published', now() - interval '1 day');
  if public.active_timeplan_document(a) is distinct from second_tp then
    raise exception 'older published timeplan overrode the latest';
  end if;
  -- ukeplans are ignored
  if public.active_timeplan_document(a) in (select id from public.documents where type = 'ukeplan') then
    raise exception 'a ukeplan was returned';
  end if;
  perform pg_temp.done();

  -- RLS applies: the child gets their own, a sibling gets nothing for A
  perform pg_temp.act_as('plan.child.a@example.com', 'authenticated');
  got := public.active_timeplan_document(a);
  if got is distinct from second_tp then raise exception 'child A active timeplan wrong'; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('plan.child.b@example.com', 'authenticated');
  if public.active_timeplan_document(a) is null then
    raise exception 'child B should resolve A''s timeplan (family-wide reads)';
  end if;
  perform pg_temp.done();
end $$;

-- 5. Regression: migrations and the service role run without a JWT (no signed-in member). The
-- "children change only done" trigger must not block them; a signed-in child is still limited.
do $$
declare a uuid; doc uuid; item uuid; t text;
begin
  select v into a from ids where k = 'a';
  perform pg_temp.done();  -- superuser, no request.jwt.claims
  insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type, status)
    values (a, 'ukeplan', 45, 2026, a || '/nojwt.pdf', 'application/pdf', 'published') returning id into doc;
  insert into public.plan_items (document_id, member_id, date, kind, text, audience)
    values (doc, a, '2026-11-02', 'homework', 'No-JWT item', 'both') returning id into item;

  update public.plan_items set kind = 'message', audience = 'parent', text = 'Changed without JWT' where id = item;
  select text into t from public.plan_items where id = item;
  if t is distinct from 'Changed without JWT' then raise exception 'no-JWT update blocked'; end if;
  update public.plan_items set audience = 'both' where id = item;

  -- a signed-in child may tick done, but not change text
  perform pg_temp.act_as('plan.child.a@example.com', 'authenticated');
  update public.plan_items set done = true where id = item;
  begin
    update public.plan_items set text = 'child edit' where id = item;
    raise exception 'child changed text';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();
end $$;

rollback;

\echo timeplan_ukeplan_rls: all checks passed
