-- RLS and trigger tests for star_tracks, stars, rewards and push_subscriptions. Made-up data only.
begin;

insert into public.members (name, email, role) values
  ('Star Child A', 'star.child.a@example.com', 'child'),
  ('Star Child B', 'star.child.b@example.com', 'child'),
  ('Star Parent 2', 'star.parent@example.com', 'parent');

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

-- 1. Parent creates tracks; constraints.
do $$
declare a uuid; b uuid; p uuid; ta uuid; tb uuid;
begin
  select id into a from public.members where email = 'star.child.a@example.com';
  select id into b from public.members where email = 'star.child.b@example.com';
  select id into p from public.members where email = 'jorgen.braseth@gmail.com';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

  insert into public.star_tracks (member_id, name, goal, milestone_every, small_reward, big_reward, preset_reasons)
    values (a, 'Tidy room', 30, 5, 'Ice cream', 'Zoo trip', array['Cleaned room', 'Helped cook']) returning id into ta;
  insert into public.star_tracks (member_id, name, goal, milestone_every) values (b, 'Reading', 10, 5) returning id into tb;

  begin
    insert into public.star_tracks (member_id, name) values (a, 'Second active');
    raise exception 'second active track accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.star_tracks (member_id, name) values (p, 'Parent track');
    raise exception 'track for a parent accepted';
  exception when check_violation then null;
  end;
  begin
    update public.star_tracks set goal = 32 where id = ta;
    raise exception 'goal not divisible by milestone accepted';
  exception when check_violation then null;
  end;
  begin
    update public.star_tracks set goal = 4, milestone_every = 2 where id = ta;
    raise exception 'goal below 5 accepted';
  exception when check_violation then null;
  end;
  begin
    update public.star_tracks set preset_reasons = array['']::text[] where id = ta;
    raise exception 'empty preset reason accepted';
  exception when check_violation then null;
  end;
  begin
    update public.star_tracks set preset_reasons = (select array_agg('r' || i) from generate_series(1, 21) i) where id = ta;
    raise exception '21 preset reasons accepted';
  exception when check_violation then null;
  end;
  begin
    update public.star_tracks set name = '' where id = ta;
    raise exception 'empty name accepted';
  exception when check_violation then null;
  end;

  perform pg_temp.done();
  insert into ids values ('a', a), ('b', b), ('ta', ta), ('tb', tb), ('p', p);
end $$;

-- 2. Visibility of tracks.
do $$
declare n int;
begin
  perform pg_temp.act_as('star.child.a@example.com', 'authenticated');
  select count(*) into n from public.star_tracks;
  if n <> 1 then raise exception 'child A should see 1 track, saw %', n; end if;
  select count(*) into n from public.star_tracks where id = (select v from ids where k = 'tb');
  if n <> 0 then raise exception 'child A saw sibling track'; end if;
  begin
    insert into public.star_tracks (member_id, name) values ((select v from ids where k = 'a'), 'Mine');
    raise exception 'child created a track';
  exception when insufficient_privilege then null;
  end;
  update public.star_tracks set goal = 5;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child updated % tracks', n; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  select count(*) into n from public.star_tracks;
  if n <> 2 then raise exception 'parent should see 2 tracks, saw %', n; end if;
  perform pg_temp.done();
end $$;

-- 3. Child requests: allowed shapes, rejected shapes, daily limit.
do $$
declare a uuid; b uuid; ta uuid; tb uuid; n int; i int; tdone uuid;
begin
  select v into a from ids where k = 'a';
  select v into b from ids where k = 'b';
  select v into ta from ids where k = 'ta';
  select v into tb from ids where k = 'tb';

  -- a completed track for child B's sibling check (B has an active one; use a new child-less approach:
  -- complete B's track, then B has no active track)
  perform pg_temp.act_as('star.child.a@example.com', 'authenticated');

  insert into public.stars (track_id, member_id, reason, requested_by)
    values (ta, a, 'Cleaned room', a);
  if (select status from public.stars limit 1) <> 'pending' then raise exception 'new star not pending'; end if;

  begin
    insert into public.stars (track_id, member_id, reason, requested_by, status)
      values (ta, a, 'Self approved', a, 'approved');
    raise exception 'child inserted approved star';
  exception when insufficient_privilege then null;
  end;
  -- a pending star never keeps decided_by (the trigger clears it before the policy check)
  insert into public.stars (track_id, member_id, reason, requested_by, decided_by)
    values (ta, a, 'Fake decider', a, a);
  if exists (select 1 from public.stars where reason = 'Fake decider' and decided_by is not null) then
    raise exception 'child set decided_by';
  end if;
  begin
    insert into public.stars (track_id, member_id, reason, requested_by, note)
      values (ta, a, 'Fake note', a, 'approved!');
    raise exception 'child set a note';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.stars (track_id, member_id, reason, requested_by)
      values (tb, b, 'For my sibling', a);
    raise exception 'child requested on sibling track';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.stars (track_id, member_id, reason, requested_by)
      values (ta, b, 'Wrong member', a);
    raise exception 'child inserted star for another member';
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    insert into public.stars (track_id, member_id, reason, requested_by)
      values (ta, a, 'Someone else asked', b);
    raise exception 'child spoofed requested_by';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.stars (track_id, member_id, reason, requested_by)
      values (ta, a, '', a);
    raise exception 'empty reason accepted';
  exception when check_violation then null;
  end;

  -- requests 3..5 are fine (5 in all), the 6th is over the limit
  for i in 3..5 loop
    insert into public.stars (track_id, member_id, reason, requested_by) values (ta, a, 'Star ' || i, a);
  end loop;
  begin
    insert into public.stars (track_id, member_id, reason, requested_by) values (ta, a, 'Star 6', a);
    raise exception 'sixth request accepted';
  exception when check_violation then
    if sqlerrm <> 'star_daily_limit' then raise exception 'wrong error: %', sqlerrm; end if;
  end;

  -- no update / delete
  update public.stars set status = 'approved';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child updated % stars', n; end if;
  delete from public.stars;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child deleted % stars', n; end if;
  select count(*) into n from public.stars;
  if n <> 5 then raise exception 'child A should see 5 stars, saw %', n; end if;
  perform pg_temp.done();

  -- child B sees none of A's stars
  perform pg_temp.act_as('star.child.b@example.com', 'authenticated');
  select count(*) into n from public.stars;
  if n <> 0 then raise exception 'child B saw % stars', n; end if;
  perform pg_temp.done();

  -- parent: direct approved star is not limited by the daily limit (even with requested_by = parent)
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  for i in 1..6 loop
    insert into public.stars (track_id, member_id, reason, status, requested_by)
      values (ta, a, 'Direct ' || i, 'approved', (select v from ids where k = 'p'));
  end loop;
  if exists (select 1 from public.stars where reason like 'Direct%' and (decided_by is null or decided_at is null)) then
    raise exception 'direct approved star lacks decided_by/at';
  end if;
  perform pg_temp.done();

  -- requests on a completed track are rejected
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  update public.star_tracks set status = 'completed', completed_at = now() where id = tb;
  perform pg_temp.done();
  perform pg_temp.act_as('star.child.b@example.com', 'authenticated');
  begin
    insert into public.stars (track_id, member_id, reason, requested_by) values (tb, b, 'Too late', b);
    raise exception 'child requested on completed track';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();
  -- reopen for later checks
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  update public.star_tracks set status = 'active', completed_at = null where id = tb;
  perform pg_temp.done();
end $$;

-- 4. Parent decisions fill decided_by/at.
do $$
declare s uuid; p uuid; r record;
begin
  select v into p from ids where k = 'p';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  select id into s from public.stars where reason = 'Cleaned room';

  update public.stars set status = 'approved' where id = s;
  select * into r from public.stars where id = s;
  if r.decided_by is distinct from p or r.decided_at is null then
    raise exception 'approval did not set decided_by/at';
  end if;

  update public.stars set status = 'declined', note = 'Not quite' where id = s;
  select * into r from public.stars where id = s;
  if r.status <> 'declined' or r.decided_by is distinct from p or r.decided_at is null then
    raise exception 'decline did not keep decided_by/at';
  end if;

  update public.stars set status = 'pending' where id = s;
  select * into r from public.stars where id = s;
  if r.decided_by is not null or r.decided_at is not null then
    raise exception 'pending did not clear decided_by/at';
  end if;

  -- a second parent re-deciding is recorded as the decider
  perform pg_temp.done();
  perform pg_temp.act_as('star.parent@example.com', 'authenticated');
  update public.stars set status = 'approved' where id = s;
  select * into r from public.stars where id = s;
  if r.decided_by is distinct from (select id from public.members where email = 'star.parent@example.com') then
    raise exception 'second parent not recorded as decider';
  end if;
  perform pg_temp.done();
end $$;

-- 5. Rewards. Track A now has 1 (Cleaned room) + 6 direct = 7 approved.
do $$
declare ta uuid; tb uuid; b uuid; p uuid; n int; i int;
begin
  select v into ta from ids where k = 'ta';
  select v into tb from ids where k = 'tb';
  select v into b from ids where k = 'b';
  select v into p from ids where k = 'p';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

  insert into public.rewards (track_id, at_count, kind, given_by) values (ta, 5, 'small', p);

  begin
    insert into public.rewards (track_id, at_count, kind) values (ta, 10, 'small');
    raise exception 'reward at 10 with 7 approved accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.rewards (track_id, at_count, kind) values (ta, 5, 'small');
    raise exception 'duplicate reward accepted';
  exception when unique_violation then null;
  end;

  -- approve up to 10 (3 more direct stars)
  for i in 1..3 loop
    insert into public.stars (track_id, member_id, reason, status)
      values (ta, (select v from ids where k = 'a'), 'More ' || i, 'approved');
  end loop;
  insert into public.rewards (track_id, at_count, kind) values (ta, 10, 'small');

  begin
    insert into public.rewards (track_id, at_count, kind) values (ta, 7, 'small');
    raise exception 'non-milestone reward accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.rewards (track_id, at_count, kind) values (ta, 15, 'big');
    raise exception 'big reward before goal accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.rewards (track_id, at_count, kind) values (ta, 0, 'small');
    raise exception 'reward at 0 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.rewards (track_id, at_count, kind) values (ta, 35, 'big');
    raise exception 'reward above goal accepted';
  exception when check_violation then null;
  end;

  -- track B: goal 10, every 5; the big reward at the goal must be 'big'
  for i in 1..10 loop
    insert into public.stars (track_id, member_id, reason, status) values (tb, b, 'B ' || i, 'approved');
  end loop;
  begin
    insert into public.rewards (track_id, at_count, kind) values (tb, 10, 'small');
    raise exception 'small reward at goal accepted';
  exception when check_violation then null;
  end;
  insert into public.rewards (track_id, at_count, kind) values (tb, 10, 'big');

  -- 15 approved on track A, so a reward at 15 is valid (for a parent) and the child's try hits RLS
  for i in 1..5 loop
    insert into public.stars (track_id, member_id, reason, status)
      values (ta, (select v from ids where k = 'a'), 'Extra ' || i, 'approved');
  end loop;
  perform pg_temp.done();

  -- child reads own rewards only, can't insert/update/delete
  perform pg_temp.act_as('star.child.a@example.com', 'authenticated');
  select count(*) into n from public.rewards;
  if n <> 2 then raise exception 'child A should see 2 rewards, saw %', n; end if;
  select count(*) into n from public.rewards where track_id = tb;
  if n <> 0 then raise exception 'child A saw sibling rewards'; end if;
  begin
    insert into public.rewards (track_id, at_count, kind) values (ta, 15, 'small');
    raise exception 'child inserted reward';
  exception when insufficient_privilege then null;
  end;
  delete from public.rewards;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child deleted % rewards', n; end if;
  perform pg_temp.done();
end $$;

-- 6. push_subscriptions: own rows only.
do $$
declare n int; a uuid; b uuid;
begin
  select v into a from ids where k = 'a';
  select v into b from ids where k = 'b';

  perform pg_temp.act_as('star.child.a@example.com', 'authenticated');
  insert into public.push_subscriptions (member_id, endpoint, keys)
    values (a, 'https://push.example.com/a', '{"p256dh":"k1","auth":"k2"}');
  begin
    insert into public.push_subscriptions (member_id, endpoint, keys)
      values (b, 'https://push.example.com/b', '{"p256dh":"k1","auth":"k2"}');
    raise exception 'child inserted a subscription for a sibling';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.push_subscriptions (member_id, endpoint, keys)
      values (a, 'https://push.example.com/bad', '{"p256dh":"k1"}');
    raise exception 'subscription without auth key accepted';
  exception when check_violation then null;
  end;
  -- upsert on endpoint with new keys updates the own row
  insert into public.push_subscriptions (member_id, endpoint, keys)
    values (a, 'https://push.example.com/a', '{"p256dh":"k3","auth":"k4"}')
    on conflict (endpoint) do update set keys = excluded.keys;
  select count(*) into n from public.push_subscriptions where keys ->> 'p256dh' = 'k3';
  if n <> 1 then raise exception 'own subscription not updated by upsert'; end if;
  update public.push_subscriptions set keys = '{"p256dh":"k5","auth":"k6"}' where endpoint = 'https://push.example.com/a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'own subscription not updatable'; end if;
  -- can't move own row to another member
  begin
    update public.push_subscriptions set member_id = b where endpoint = 'https://push.example.com/a';
    raise exception 'moved subscription to another member';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.done();

  perform pg_temp.act_as('star.child.b@example.com', 'authenticated');
  insert into public.push_subscriptions (member_id, endpoint, keys)
    values (b, 'https://push.example.com/b', '{"p256dh":"k1","auth":"k2"}');
  select count(*) into n from public.push_subscriptions;
  if n <> 1 then raise exception 'child B should see 1 subscription, saw %', n; end if;
  -- can't touch A's row: plain update hits nothing, an upsert on A's endpoint is refused
  update public.push_subscriptions set keys = '{"p256dh":"x","auth":"y"}' where endpoint = 'https://push.example.com/a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child B updated A''s subscription'; end if;
  begin
    insert into public.push_subscriptions (member_id, endpoint, keys)
      values (b, 'https://push.example.com/a', '{"p256dh":"x","auth":"y"}')
      on conflict (endpoint) do update set keys = excluded.keys, member_id = excluded.member_id;
    raise exception 'child B hijacked A''s subscription by upsert';
  exception when insufficient_privilege then null;
  end;
  delete from public.push_subscriptions where endpoint = 'https://push.example.com/a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child B deleted A''s subscription'; end if;
  perform pg_temp.done();

  -- even a parent sees only their own
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  select count(*) into n from public.push_subscriptions;
  if n <> 0 then raise exception 'parent saw % foreign subscriptions', n; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('star.child.a@example.com', 'authenticated');
  delete from public.push_subscriptions;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'child A could not delete own subscription'; end if;
  perform pg_temp.done();
end $$;

-- 7. Stranger and anon see nothing.
do $$
declare n int; t text;
begin
  perform pg_temp.act_as('stranger@example.com', 'authenticated');
  select count(*) into n from public.star_tracks;
  if n <> 0 then raise exception 'stranger saw tracks'; end if;
  select count(*) into n from public.stars;
  if n <> 0 then raise exception 'stranger saw stars'; end if;
  select count(*) into n from public.rewards;
  if n <> 0 then raise exception 'stranger saw rewards'; end if;
  select count(*) into n from public.push_subscriptions;
  if n <> 0 then raise exception 'stranger saw subscriptions'; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'anon');
  foreach t in array array['star_tracks', 'stars', 'rewards', 'push_subscriptions'] loop
    begin
      execute format('select count(*) from public.%I', t);
      raise exception 'anon read %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  perform pg_temp.done();
end $$;

rollback;

\echo stars_rls: all checks passed
