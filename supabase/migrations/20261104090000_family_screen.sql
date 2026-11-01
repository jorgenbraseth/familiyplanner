-- Familieskjerm: a shared tablet that signs in with its own Google account, a `members` row with
-- role 'screen'. Everyone uses it to look at and tick off their own things. It can do what a child
-- does for ANY child (request a pending star, tick routine items today, tick homework done), and
-- nothing else: stars it creates are always pending (a parent approves on another device), and it
-- never passes is_parent(), so every parent-only policy and trigger keeps applying to it.
-- It reads through the existing family-wide read policies (current_member_id() is not null).

alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check check (role in ('parent', 'child', 'screen'));

create or replace function public.is_screen()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members where email = lower(auth.email()) and role = 'screen'
  )
$$;

revoke execute on function public.is_screen() from public, anon;
grant execute on function public.is_screen() to authenticated;

-- True when the member is a child (security definer: the lookup is not filtered by the caller's RLS).
create or replace function public.is_child_member(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.members m where m.id = p_member_id and m.role = 'child')
$$;

revoke execute on function public.is_child_member(uuid) from public, anon;
grant execute on function public.is_child_member(uuid) to authenticated;

-- stars: the screen requests for any child, always pending, on that child's active track.
-- requested_by is the screen member itself (honest audit trail). The triggers still apply:
-- stars_apply_task sets the amount (1 without a task), stars_check_routine requires a complete
-- routine today with the routine's own star task (it skips only parents), stars_fill_decision
-- clears decided_by/decided_at for pending rows.
drop policy if exists "stars: screen requests for a child" on public.stars;
create policy "stars: screen requests for a child"
  on public.stars for insert to authenticated
  with check (
    public.is_screen()
    and public.is_child_member(member_id)
    and requested_by = public.current_member_id()
    and status = 'pending'
    and decided_by is null
    and decided_at is null
    and note is null
    and exists (
      select 1 from public.star_tracks t
      where t.id = track_id and t.member_id = stars.member_id and t.status = 'active'
    )
  );

-- routine_checks: check and uncheck any child's items, today only.
drop policy if exists "routine_checks: screen checks today" on public.routine_checks;
create policy "routine_checks: screen checks today"
  on public.routine_checks for insert to authenticated
  with check (public.is_screen() and public.is_child_member(member_id) and date = public.routine_today());

drop policy if exists "routine_checks: screen unchecks today" on public.routine_checks;
create policy "routine_checks: screen unchecks today"
  on public.routine_checks for delete to authenticated
  using (public.is_screen() and public.is_child_member(member_id) and date = public.routine_today());

-- plan_items: tick a child's published, non-parent item done. The plan_items_children_done_only
-- trigger restricts every signed-in non-parent (the screen included) to changing `done`.
drop policy if exists "plan_items: screen marks done" on public.plan_items;
create policy "plan_items: screen marks done"
  on public.plan_items for update to authenticated
  using (
    public.is_screen()
    and public.is_child_member(member_id)
    and audience <> 'parent'
    and exists (select 1 from public.documents d where d.id = document_id and d.status = 'published')
  )
  with check (public.is_screen() and public.is_child_member(member_id) and audience <> 'parent');
