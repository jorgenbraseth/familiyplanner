-- RLS tests for documents, plan_items and the `documents` bucket. Made-up data only.
begin;

insert into public.members (name, email, role) values
  ('Doc Child A', 'doc.child.a@example.com', 'child'),
  ('Doc Child B', 'doc.child.b@example.com', 'child');

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

-- Scratch table (superuser) to carry ids between blocks.
create temp table ids (k text primary key, v uuid);
grant all on ids to public;

-- 1. Parent creates documents and items for both children.
do $$
declare a uuid; b uuid; da uuid; db uuid; n int;
begin
  select id into a from public.members where email = 'doc.child.a@example.com';
  select id into b from public.members where email = 'doc.child.b@example.com';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');

  insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type)
    values (a, 'week_schedule', 43, 2026, a || '/doc-a.pdf', 'application/pdf') returning id into da;
  insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type)
    values (b, 'homework', 43, 2026, b || '/doc-b.png', 'image/png') returning id into db;
  insert into public.plan_items (document_id, member_id, date, kind, subject, text, sort) values
    (da, a, '2026-10-26', 'lesson', 'Math', 'Fractions', 1),
    (da, a, '2026-10-27', 'bring', null, 'Swimming bag', 2),
    (db, b, '2026-10-26', 'homework', 'Reading', 'Chapter 3', 1);

  -- member_id must match the document's
  begin
    insert into public.plan_items (document_id, member_id, date, kind, text) values (da, b, '2026-10-26', 'note', 'Wrong child');
    raise exception 'mismatched member_id accepted';
  exception when check_violation then null;
  end;

  -- bad enum / empty text
  begin
    insert into public.plan_items (document_id, member_id, date, kind, text) values (da, a, '2026-10-26', 'bogus', 'x');
    raise exception 'bad kind accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.plan_items (document_id, member_id, date, kind, text) values (da, a, '2026-10-26', 'note', '');
    raise exception 'empty text accepted';
  exception when check_violation then null;
  end;

  select count(*) into n from public.plan_items;
  if n <> 3 then raise exception 'parent should see 3 items, saw %', n; end if;

  perform pg_temp.done();
  insert into ids values ('da', da), ('db', db), ('a', a), ('b', b);
  insert into storage.objects (bucket_id, name) values
    ('documents', a || '/doc-a.pdf'), ('documents', b || '/doc-b.png');
end $$;

-- 2. Child A sees nothing while the document is in review (db, items, storage).
do $$
declare n int;
begin
  perform pg_temp.act_as('doc.child.a@example.com', 'authenticated');
  select count(*) into n from public.documents;
  if n <> 0 then raise exception 'child saw % unpublished documents', n; end if;
  select count(*) into n from public.plan_items;
  if n <> 0 then raise exception 'child saw % unpublished items', n; end if;
  select count(*) into n from storage.objects;
  if n <> 0 then raise exception 'child saw % unpublished objects', n; end if;
  perform pg_temp.done();
end $$;

-- 3. Publish A's document only; child A sees only own stuff; B's stays hidden.
do $$
declare n int; da uuid; item uuid;
begin
  select v into da from ids where k = 'da';
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  update public.documents set status = 'published' where id = da;
  perform pg_temp.done();

  perform pg_temp.act_as('doc.child.a@example.com', 'authenticated');
  select count(*) into n from public.documents;
  if n <> 1 then raise exception 'child A should see 1 document, saw %', n; end if;
  select count(*) into n from public.plan_items;
  if n <> 2 then raise exception 'child A should see 2 items, saw %', n; end if;
  select count(*) into n from public.plan_items where member_id = (select v from ids where k = 'b');
  if n <> 0 then raise exception 'child A saw B items'; end if;
  select count(*) into n from storage.objects;
  if n <> 1 then raise exception 'child A should see 1 object, saw %', n; end if;
  select count(*) into n from storage.objects where name like '%doc-b%';
  if n <> 0 then raise exception 'child A saw B file'; end if;

  -- toggle done
  select id into item from public.plan_items where text = 'Fractions';
  update public.plan_items set done = true where id = item;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'child could not toggle done'; end if;

  -- other columns are locked
  begin
    update public.plan_items set text = 'Hacked' where id = item;
    raise exception 'child changed text';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.plan_items set date = '2026-11-01' where id = item;
    raise exception 'child changed date';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.plan_items set done = false, sort = 99 where id = item;
    raise exception 'child changed sort together with done';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.plan_items set member_id = (select v from ids where k = 'b') where id = item;
    raise exception 'child reassigned item';
  exception when insufficient_privilege or check_violation or sqlstate '42501' then null;
  end;

  -- no insert / delete
  begin
    insert into public.plan_items (document_id, member_id, date, kind, text)
      values ((select v from ids where k = 'da'), (select v from ids where k = 'a'), '2026-10-28', 'note', 'Mine');
    raise exception 'child inserted item';
  exception when insufficient_privilege then null;
  end;
  delete from public.plan_items;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child deleted % items', n; end if;
  begin
    insert into public.documents (member_id, type, iso_week, iso_year, file_path, mime_type)
      values ((select v from ids where k = 'a'), 'other', 1, 2026, 'x/y.pdf', 'application/pdf');
    raise exception 'child inserted document';
  exception when insufficient_privilege then null;
  end;

  perform pg_temp.done();
end $$;

-- 4. Child B cannot see or toggle A's items.
do $$
declare n int;
begin
  perform pg_temp.act_as('doc.child.b@example.com', 'authenticated');
  select count(*) into n from public.plan_items;
  if n <> 0 then raise exception 'child B saw % items', n; end if;
  update public.plan_items set done = true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'child B updated % items', n; end if;
  select count(*) into n from storage.objects;
  if n <> 0 then raise exception 'child B saw % objects', n; end if;
  perform pg_temp.done();
end $$;

-- 5. Stranger and anon see nothing.
do $$
declare n int;
begin
  perform pg_temp.act_as('stranger@example.com', 'authenticated');
  select count(*) into n from public.documents;
  if n <> 0 then raise exception 'stranger saw documents'; end if;
  select count(*) into n from storage.objects;
  if n <> 0 then raise exception 'stranger saw objects'; end if;
  perform pg_temp.done();

  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'anon');
  begin
    perform count(*) from public.documents;
    raise exception 'anon read documents';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.plan_items;
    raise exception 'anon read plan_items';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from storage.objects;
  if n <> 0 then raise exception 'anon saw objects'; end if;
  perform pg_temp.done();
end $$;

-- 6. Parent reads all storage objects and can delete a document (cascade removes items).
do $$
declare n int;
begin
  perform pg_temp.act_as('jorgen.braseth@gmail.com', 'authenticated');
  select count(*) into n from storage.objects;
  if n <> 2 then raise exception 'parent should see 2 objects, saw %', n; end if;
  delete from public.documents where id = (select v from ids where k = 'da');
  select count(*) into n from public.plan_items;
  if n <> 1 then raise exception 'cascade left % items', n; end if;
  perform pg_temp.done();
end $$;

rollback;

\echo documents_rls: all checks passed
