-- Family-wide reads: every signed-in family member may READ the school, star and routine data of the
-- whole family (so anyone can ask the assistant about anyone else). Writes are unchanged: children
-- still change only their own rows (existing policies), parents everything.
--
-- Stays restricted: documents in review/processing/failed, plan items with audience 'parent',
-- storage objects (the PDFs), assistant_log, push_subscriptions.
-- Members are already readable by every allowlisted member ("members: allowlisted read").
--
-- These policies are added next to the old "child reads own" ones (permissive policies are OR-ed).
-- App code that must show only one child's rows has to filter on member_id explicitly.

-- documents: metadata of published documents only (file_path included; the files stay protected by
-- the storage policies).
drop policy if exists "documents: family reads published" on public.documents;
create policy "documents: family reads published"
  on public.documents for select to authenticated
  using (public.current_member_id() is not null and status = 'published');

-- plan_items: published documents only, never parent-audience items.
drop policy if exists "plan_items: family reads published" on public.plan_items;
create policy "plan_items: family reads published"
  on public.plan_items for select to authenticated
  using (
    public.current_member_id() is not null
    and audience <> 'parent'
    and exists (select 1 from public.documents d where d.id = document_id and d.status = 'published')
  );

-- timetable and school hours: rows of published documents.
drop policy if exists "timetable_days: family reads published" on public.timetable_days;
create policy "timetable_days: family reads published"
  on public.timetable_days for select to authenticated
  using (
    public.current_member_id() is not null
    and exists (select 1 from public.documents d where d.id = document_id and d.status = 'published')
  );

drop policy if exists "timetable_periods: family reads published" on public.timetable_periods;
create policy "timetable_periods: family reads published"
  on public.timetable_periods for select to authenticated
  using (
    public.current_member_id() is not null
    and exists (select 1 from public.documents d where d.id = document_id and d.status = 'published')
  );

drop policy if exists "school_days: family reads published" on public.school_days;
create policy "school_days: family reads published"
  on public.school_days for select to authenticated
  using (
    public.current_member_id() is not null
    and exists (select 1 from public.documents d where d.id = document_id and d.status = 'published')
  );

-- stars
drop policy if exists "star_tracks: family reads" on public.star_tracks;
create policy "star_tracks: family reads"
  on public.star_tracks for select to authenticated
  using (public.current_member_id() is not null);

drop policy if exists "stars: family reads" on public.stars;
create policy "stars: family reads"
  on public.stars for select to authenticated
  using (public.current_member_id() is not null);

drop policy if exists "rewards: family reads" on public.rewards;
create policy "rewards: family reads"
  on public.rewards for select to authenticated
  using (public.current_member_id() is not null);

-- star_tasks: already readable for own and all-children tasks; now every task.
drop policy if exists "star_tasks: family reads" on public.star_tasks;
create policy "star_tasks: family reads"
  on public.star_tasks for select to authenticated
  using (public.current_member_id() is not null);

-- routines (read only; checking and unchecking stays on own rows, today only)
drop policy if exists "routine_items: family reads" on public.routine_items;
create policy "routine_items: family reads"
  on public.routine_items for select to authenticated
  using (public.current_member_id() is not null);

drop policy if exists "routine_settings: family reads" on public.routine_settings;
create policy "routine_settings: family reads"
  on public.routine_settings for select to authenticated
  using (public.current_member_id() is not null);

drop policy if exists "routine_checks: family reads" on public.routine_checks;
create policy "routine_checks: family reads"
  on public.routine_checks for select to authenticated
  using (public.current_member_id() is not null);
