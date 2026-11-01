-- Made-up family for the mock stack (scripts/mock, docs/MOCK.md). No real people or data.
-- Every date is relative to today in Europe/Copenhagen, so pages always look current.
-- Fixed ids so screenshot configs can address them:
--   Kari  11111111-1111-4111-8111-111111111111 (parent)    Ola   22222222-2222-4222-8222-222222222222 (parent)
--   Emma  33333333-3333-4333-8333-333333333333 (child, 10) Jonas 44444444-4444-4444-8444-444444444444 (child, 7)
--   Emma's ukeplan under review: aaaaaaaa-0000-4000-8000-000000000005
do $seed$
declare
  kari  constant uuid := '11111111-1111-4111-8111-111111111111';
  ola   constant uuid := '22222222-2222-4222-8222-222222222222';
  emma  constant uuid := '33333333-3333-4333-8333-333333333333';
  jonas constant uuid := '44444444-4444-4444-8444-444444444444';
  today date := (now() at time zone 'Europe/Copenhagen')::date;
  monday date := date_trunc('week', (now() at time zone 'Europe/Copenhagen')::date)::date;
  lastmon date := monday - 7;
  nextmon date := monday + 7;
  d_tp_emma  constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  d_tp_jonas constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  d_uk_emma  constant uuid := 'aaaaaaaa-0000-4000-8000-000000000003';
  d_uk_jonas constant uuid := 'aaaaaaaa-0000-4000-8000-000000000004';
  d_rev_emma constant uuid := 'aaaaaaaa-0000-4000-8000-000000000005';
  d_old_emma constant uuid := 'aaaaaaaa-0000-4000-8000-000000000006';
  d_fail_jonas constant uuid := 'aaaaaaaa-0000-4000-8000-000000000007';
  tr_emma constant uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  tr_emma_old constant uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  tr_jonas constant uuid := 'bbbbbbbb-0000-4000-8000-000000000003';
  tk_all_room constant uuid := 'cccccccc-0000-4000-8000-000000000001';
  tk_all_dinner constant uuid := 'cccccccc-0000-4000-8000-000000000002';
  tk_emma_read constant uuid := 'cccccccc-0000-4000-8000-000000000003';
  tk_jonas_teeth constant uuid := 'cccccccc-0000-4000-8000-000000000004';
  tk_morning constant uuid := 'cccccccc-0000-4000-8000-000000000005';
  tk_evening constant uuid := 'cccccccc-0000-4000-8000-000000000006';
  wd int;
begin
  -- Members ---------------------------------------------------------------------------------------------------
  insert into public.members (id, name, email, role, calendar_ids, colour, theme, avatar_path, created_at) values
    (kari,  'Kari',  'kari@example.test',  'parent', array['kari@example.test'],  '#7c3aed', 'skog',  null,                                              now() - interval '40 days'),
    (ola,   'Ola',   'ola@example.test',   'parent', array['ola@example.test'],   '#0d9488', 'orden', ola   || '/00000000-0000-4000-8000-0000000000a1.webp', now() - interval '39 days'),
    (emma,  'Emma',  'emma@example.test',  'child',  array['emma@example.test', 'barna@example.test'], '#e11d48', 'godteri', emma  || '/00000000-0000-4000-8000-0000000000a2.webp', now() - interval '38 days'),
    (jonas, 'Jonas', 'jonas@example.test', 'child',  array['jonas@example.test', 'barna@example.test'], '#f59e0b', 'fjord',   jonas || '/00000000-0000-4000-8000-0000000000a3.webp', now() - interval '37 days');

  -- Star tracks -----------------------------------------------------------------------------------------------
  insert into public.star_tracks (id, member_id, name, goal, milestone_every, small_reward, big_reward, status, created_at, completed_at) values
    (tr_emma_old, emma, 'Vår 2026', 20, 5, 'Is etter middag', 'Kinotur', 'completed', now() - interval '200 days', now() - interval '60 days'),
    (tr_emma, emma, 'Høstens stjernejakt', 30, 5, 'Velge kveldsmat', 'Tur til badelandet', 'active', now() - interval '30 days', null),
    (tr_jonas, jonas, 'Jonas sin stjernejakt', 20, 5, 'Ekstra lesing av eventyr', 'Bli med på jobb til pappa', 'active', now() - interval '25 days', null);

  -- Star tasks (no member = for all children) -----------------------------------------------------------------
  insert into public.star_tasks (id, member_id, name, stars, sort) values
    (tk_all_room, null, 'Rydde rommet', 1, 0),
    (tk_all_dinner, null, 'Hjelpe til med middag', 2, 1),
    (tk_morning, null, 'Morgenstell ferdig', 1, 2),
    (tk_evening, null, 'Kveldsstell ferdig', 1, 3),
    (tk_emma_read, emma, 'Lese i 20 minutter', 1, 4),
    (tk_jonas_teeth, jonas, 'Pusse tenner uten mas', 1, 5);

  -- Stars: Emma has 17 approved (rewards at 5 and 10 given, 15 owed), 2 pending, 1 declined ---------------------
  insert into public.stars (track_id, member_id, reason, status, amount, task_id, requested_by, decided_by, decided_at, note, created_at)
  select tr_emma, emma, 'Rydde rommet', 'approved', 1, tk_all_room, emma, kari, now() - (n || ' days')::interval, null, now() - (n || ' days')::interval - interval '2 hours'
  from generate_series(4, 13) n;
  insert into public.stars (track_id, member_id, reason, status, amount, task_id, requested_by, decided_by, decided_at, created_at) values
    (tr_emma, emma, 'Hjelpe til med middag', 'approved', 2, tk_all_dinner, emma, ola, now() - interval '3 days', now() - interval '3 days 3 hours'),
    (tr_emma, emma, 'Hjelpe til med middag', 'approved', 2, tk_all_dinner, emma, kari, now() - interval '2 days', now() - interval '2 days 3 hours'),
    (tr_emma, emma, 'Lese i 20 minutter', 'approved', 1, tk_emma_read, emma, kari, now() - interval '1 day', now() - interval '1 day 4 hours'),
    (tr_emma, emma, 'Lese i 20 minutter', 'approved', 1, tk_emma_read, emma, ola, now() - interval '20 hours', now() - interval '21 hours');
  insert into public.stars (track_id, member_id, reason, status, amount, task_id, requested_by, created_at) values
    (tr_emma, emma, 'Hjelpe til med middag', 'pending', 2, tk_all_dinner, emma, now() - interval '3 hours'),
    (tr_emma, emma, 'Lese i 20 minutter', 'pending', 1, tk_emma_read, emma, now() - interval '1 hour');
  insert into public.stars (track_id, member_id, reason, status, amount, requested_by, decided_by, decided_at, note, created_at) values
    (tr_emma, emma, 'Gjorde lekser uten å bli bedt', 'declined', 1, emma, kari, now() - interval '5 days', 'Det gjør du jo hver dag :)', now() - interval '5 days 2 hours');
  -- Jonas: 7 approved, 1 pending
  insert into public.stars (track_id, member_id, reason, status, amount, task_id, requested_by, decided_by, decided_at, created_at)
  select tr_jonas, jonas, 'Pusse tenner uten mas', 'approved', 1, tk_jonas_teeth, jonas, kari, now() - (n || ' days')::interval, now() - (n || ' days')::interval - interval '1 hour'
  from generate_series(2, 8) n;
  insert into public.stars (track_id, member_id, reason, status, amount, task_id, requested_by, created_at) values
    (tr_jonas, jonas, 'Rydde rommet', 'pending', 1, tk_all_room, jonas, now() - interval '30 minutes');
  -- Old completed track for Emma (history)
  insert into public.stars (track_id, member_id, reason, status, amount, requested_by, decided_by, decided_at, created_at)
  select tr_emma_old, emma, 'Rydde rommet', 'approved', 1, emma, kari, now() - interval '100 days', now() - interval '101 days'
  from generate_series(1, 20);

  insert into public.rewards (track_id, at_count, kind, given_at, given_by) values
    (tr_emma, 5, 'small', now() - interval '12 days', kari),
    (tr_emma, 10, 'small', now() - interval '4 days', ola),
    (tr_emma_old, 5, 'small', now() - interval '120 days', kari),
    (tr_emma_old, 10, 'small', now() - interval '110 days', kari),
    (tr_emma_old, 15, 'small', now() - interval '105 days', kari),
    (tr_emma_old, 20, 'big', now() - interval '60 days', kari);

  -- Routines --------------------------------------------------------------------------------------------------
  insert into public.routine_items (id, member_id, slot, name, sort)
  select gen_random_uuid(), m, i.s, i.name, i.ord
  from (values (emma), (jonas)) as kids(m),
       (values ('morning', 'Kle på deg', 0), ('morning', 'Spise frokost', 1), ('morning', 'Pusse tenner', 2), ('morning', 'Pakke skolesekken', 3),
               ('evening', 'Rydde leker', 0), ('evening', 'Bade eller dusje', 1), ('evening', 'Pusse tenner', 2), ('evening', 'Lese en bok', 3)) as i(s, name, ord);
  insert into public.routine_settings (member_id, slot, star_task_id) values
    (emma, 'morning', tk_morning), (emma, 'evening', tk_evening),
    (jonas, 'morning', tk_morning), (jonas, 'evening', tk_evening);
  -- Emma: morning done (and its star requested), evening half done. Jonas: morning half done.
  insert into public.routine_checks (item_id, member_id, date, checked_at)
  select i.id, i.member_id, today, now() - interval '3 hours'
  from public.routine_items i where i.member_id = emma and i.slot = 'morning';
  insert into public.routine_checks (item_id, member_id, date, checked_at)
  select i.id, i.member_id, today, now() - interval '30 minutes'
  from public.routine_items i where i.member_id = emma and i.slot = 'evening' and i.sort < 2;
  insert into public.routine_checks (item_id, member_id, date, checked_at)
  select i.id, i.member_id, today, now() - interval '2 hours'
  from public.routine_items i where i.member_id = jonas and i.slot = 'morning' and i.sort < 2;
  insert into public.stars (track_id, member_id, reason, status, amount, task_id, requested_by, routine_slot, routine_date, created_at)
  values (tr_emma, emma, 'Morgenstell ferdig', 'pending', 1, tk_morning, emma, 'morning', today, now() - interval '2 hours');

  -- Documents -------------------------------------------------------------------------------------------------
  insert into public.documents (id, member_id, type, iso_week, iso_year, file_path, mime_type, status, error, uploaded_by, created_at) values
    (d_tp_emma,  emma,  'timeplan', null, null, emma  || '/' || d_tp_emma  || '.pdf', 'application/pdf', 'published', null, kari, now() - interval '60 days'),
    (d_tp_jonas, jonas, 'timeplan', null, null, jonas || '/' || d_tp_jonas || '.pdf', 'application/pdf', 'published', null, kari, now() - interval '59 days'),
    (d_old_emma, emma,  'ukeplan', extract(week from lastmon)::int, extract(isoyear from lastmon)::int, emma || '/' || d_old_emma || '.pdf', 'application/pdf', 'published', null, kari, now() - interval '8 days'),
    (d_uk_emma,  emma,  'ukeplan', extract(week from monday)::int,  extract(isoyear from monday)::int,  emma || '/' || d_uk_emma  || '.pdf', 'application/pdf', 'published', null, kari, now() - interval '2 days'),
    (d_uk_jonas, jonas, 'ukeplan', extract(week from monday)::int,  extract(isoyear from monday)::int,  jonas || '/' || d_uk_jonas || '.pdf', 'application/pdf', 'published', null, ola,  now() - interval '2 days'),
    (d_rev_emma, emma,  'ukeplan', extract(week from nextmon)::int, extract(isoyear from nextmon)::int, emma || '/' || d_rev_emma || '.pdf', 'application/pdf', 'review', null, kari, now() - interval '3 hours'),
    (d_fail_jonas, jonas, 'ukeplan', extract(week from nextmon)::int, extract(isoyear from nextmon)::int, jonas || '/' || d_fail_jonas || '.png', 'image/png', 'failed', 'Kunne ikke lese bildet: for uskarpt.', ola, now() - interval '5 hours');

  -- Timetables (Mon-Fri; Friday ends earlier) ------------------------------------------------------------------
  for wd in 1..5 loop
    insert into public.timetable_days (document_id, member_id, weekday, starts_at, ends_at) values
      (d_tp_emma, emma, wd, '08:15'::time, (case wd when 5 then '12:45' else '14:30' end)::time),
      (d_tp_jonas, jonas, wd, '08:30'::time, (case wd when 5 then '12:00' else '13:45' end)::time);
  end loop;
  insert into public.timetable_periods (document_id, member_id, weekday, period, starts_at, ends_at, subject, sort)
  select d_tp_emma, emma, w, p.period, p.s::time, p.e::time, p.subj[w], p.period
  from generate_series(1, 5) w,
       (values
         (1, '08:15', '09:00', array['Norsk','Matte','Engelsk','Norsk','Matte']),
         (2, '09:00', '09:45', array['Norsk','Matte','Engelsk','Naturfag','Matte']),
         (3, '10:00', '10:45', array['Matte','Kroppsøving','Kunst og håndverk','Naturfag','Samfunnsfag']),
         (4, '10:45', '11:30', array['Samfunnsfag','Kroppsøving','Kunst og håndverk','Musikk','Samfunnsfag']),
         (5, '12:00', '12:45', array['Engelsk','Norsk','Mat og helse','Matte','Valgfag']),
         (6, '12:45', '13:30', array['Valgfag','Norsk','Mat og helse','Lunsj','Lunsj'])) as p(period, s, e, subj)
  where not (w = 5 and p.period = 6);
  insert into public.timetable_periods (document_id, member_id, weekday, period, starts_at, ends_at, subject, sort)
  select d_tp_jonas, jonas, w, p.period, p.s::time, p.e::time, p.subj[w], p.period
  from generate_series(1, 5) w,
       (values
         (1, '08:30', '09:15', array['Norsk','Matte','Norsk','Engelsk','Matte']),
         (2, '09:15', '10:00', array['Norsk','Matte','Norsk','Engelsk','Matte']),
         (3, '10:15', '11:00', array['Kroppsøving','Natur og miljø','Musikk','Matte','Norsk']),
         (4, '11:00', '11:45', array['Kroppsøving','Natur og miljø','Musikk','Matte','Norsk']),
         (5, '12:15', '13:00', array['Kunst og håndverk','Norsk','Matte','Norsk','Lunsj']),
         (6, '13:00', '13:45', array['Kunst og håndverk','Norsk','Matte','Norsk','Lunsj'])) as p(period, s, e, subj)
  where not (w = 5 and p.period >= 6);

  -- Ukeplan items, current week: Emma ------------------------------------------------------------------------
  insert into public.plan_items (document_id, member_id, date, kind, subject, text, done, sort, audience, whole_week, starts_at, ends_at) values
    (d_uk_emma, emma, monday,     'homework', 'Matte',  E'Gjør oppgave 3 og 4 i Multi:\n- Side 45\n- Side 46', false, 0, 'both', false, null, null),
    (d_uk_emma, emma, monday + 1, 'homework', 'Norsk',  E'Les kapittel 5 i lesebok\nSkriv tre setninger om det du leste', (today > monday + 1), 0, 'both', false, null, null),
    (d_uk_emma, emma, monday + 2, 'homework', 'Engelsk', E'Glosene på side 32:\n1. apple\n2. banana\n3. cherry\n4. lemon', false, 0, 'both', false, null, null),
    (d_uk_emma, emma, monday + 3, 'homework', 'Naturfag', 'Forbered en kort presentasjon om et dyr du liker', false, 0, 'both', false, null, null),
    (d_uk_emma, emma, monday + 4, 'homework', 'Samfunnsfag', E'Les side 60-63\nTa med en avisartikkel til fredag', false, 0, 'both', false, null, null),
    (d_uk_emma, emma, monday,     'homework', 'Musikk', 'Øv på sangen til felles samling', true, 1, 'both', false, null, null),
    (d_uk_emma, emma, monday + 1, 'message', null, 'Husk gymtøy og vannflaske i morgen.', false, 0, 'child', false, null, null),
    (d_uk_emma, emma, monday + 2, 'event', 'Skolen', 'Besøk på biblioteket', false, 0, 'both', false, '09:00'::time, '10:30'::time),
    (d_uk_emma, emma, monday + 3, 'message', null, E'Foreldremøte onsdag neste uke kl. 18:00.\nPåmelding i Skoleintra innen torsdag.', false, 0, 'parent', false, null, null),
    (d_uk_emma, emma, monday + 4, 'event', 'Klassen', 'Felles samling med foreldre', false, 1, 'both', false, '13:00'::time, '13:45'::time),
    (d_uk_emma, emma, monday,     'message', null, E'Denne uka jobber vi med:\n- Brøk i matte\n- Dyr i naturfag\n- Fortellinger i norsk', false, 2, 'both', true, null, null),
    (d_uk_emma, emma, monday,     'homework', 'Lesing', 'Les 20 minutter hver dag og skriv det i leseloggen', false, 3, 'both', true, null, null);
  -- Last week's plan: unfinished homework that carries over
  insert into public.plan_items (document_id, member_id, date, kind, subject, text, done, sort, audience, whole_week) values
    -- Last week's unfinished homework: must NOT show anywhere (carry-over is within the current ISO week only).
    (d_old_emma, emma, lastmon + 3, 'homework', 'Matte', 'Gjør oppgave 7 side 40', false, 0, 'both', false),
    (d_old_emma, emma, lastmon + 4, 'homework', 'Norsk', E'Skriv ferdig fortellingen:\n- Innledning\n- Hendelse\n- Avslutning', false, 0, 'both', false),
    (d_old_emma, emma, lastmon + 4, 'homework', 'Engelsk', 'Lær glosene', true, 1, 'both', false);

  -- Ukeplan items, current week: Jonas
  insert into public.plan_items (document_id, member_id, date, kind, subject, text, done, sort, audience, whole_week, starts_at, ends_at) values
    (d_uk_jonas, jonas, monday,     'homework', 'Norsk', 'Les side 12 høyt for en voksen', (today > monday), 0, 'both', false, null, null),
    (d_uk_jonas, jonas, monday + 1, 'homework', 'Matte', E'Regn oppgavene:\n- 3 + 4\n- 5 + 2\n- 8 - 3', false, 0, 'both', false, null, null),
    (d_uk_jonas, jonas, monday + 2, 'homework', 'Engelsk', 'Si fargene på engelsk til mamma eller pappa', false, 0, 'both', false, null, null),
    (d_uk_jonas, jonas, monday + 3, 'homework', 'Norsk', 'Øv på bokstavene L og M', false, 0, 'both', false, null, null),
    (d_uk_jonas, jonas, monday + 4, 'homework', 'Matte', 'Ta med noe rundt og noe firkantet hjemmefra', false, 0, 'both', false, null, null),
    (d_uk_jonas, jonas, monday + 1, 'message', null, 'Husk utetøy og skiftetøy i sekken.', false, 0, 'both', false, null, null),
    (d_uk_jonas, jonas, monday + 3, 'event', 'Skolen', 'Skolefotografering', false, 0, 'both', false, '10:00'::time, '11:00'::time),
    (d_uk_jonas, jonas, monday + 2, 'message', null, 'Betaling for skoleturen (kr 150) innen fredag.', false, 0, 'parent', false, null, null);

  -- The document in review: Emma's plan for next week
  insert into public.plan_items (document_id, member_id, date, kind, subject, text, done, sort, audience, whole_week, starts_at, ends_at) values
    (d_rev_emma, emma, nextmon,     'homework', 'Matte',  E'Gjør oppgave 1 til 5 side 50:\n- Brøk\n- Likeverdige brøker', false, 0, 'both', false, null, null),
    (d_rev_emma, emma, nextmon + 1, 'homework', 'Norsk',  'Skriv en kort tekst om hva du gjorde i høstferien', false, 0, 'both', false, null, null),
    (d_rev_emma, emma, nextmon + 2, 'homework', 'Engelsk', E'Lær glosene:\n1. house\n2. garden\n3. window', false, 0, 'both', false, null, null),
    (d_rev_emma, emma, nextmon + 2, 'event', 'Klassen', 'Tur til skogen', false, 0, 'both', false, '09:00'::time, '13:00'::time),
    (d_rev_emma, emma, nextmon + 3, 'message', null, 'Ta med niste og drikke på tur.', false, 0, 'child', false, null, null),
    (d_rev_emma, emma, nextmon + 3, 'message', null, 'Foreldremøte kl. 18:00 - husk påmelding.', false, 1, 'parent', false, null, null),
    (d_rev_emma, emma, nextmon,     'message', null, E'Ukas tema:\n- Brøk\n- Høstens farger', false, 0, 'both', true, null, null);

  -- Assistant log (parents' log) ------------------------------------------------------------------------------
  insert into public.assistant_log (member_id, asked_for, question, answer, tools_used, created_at) values
    (kari, emma, 'Hva skal jeg ha med på skolen i morgen?', 'I morgen skal du ha med gymtøy og niste.', array['get_plan_items'], now() - interval '30 minutes'),
    (emma, null, 'Hva er leksene mine i dag?', 'I dag har du matte: gjør oppgave 3 og 4 i Multi.', array['homework_for_day'], now() - interval '2 hours'),
    (jonas, null, 'Når slutter skolen i morgen?', 'Skolen slutter klokka 13:45.', array['school_hours'], now() - interval '1 day'),
    (kari, null, 'Hvor mange stjerner har Emma?', 'Emma har 17 stjerner av 30.', array['star_progress'], now() - interval '3 days');
end
$seed$;
