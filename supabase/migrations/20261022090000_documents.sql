-- Documents (uploaded school papers), the plan items extracted from them, and the private
-- `documents` storage bucket. Shapes must match src/lib/plan.ts.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  type text not null check (type in ('week_schedule', 'homework', 'other')),
  iso_week int not null check (iso_week between 1 and 53),
  iso_year int not null check (iso_year between 2000 and 2100),
  file_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  status text not null default 'processing' check (status in ('processing', 'review', 'published', 'failed')),
  error text,
  uploaded_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index documents_member_week_idx on public.documents (member_id, iso_year, iso_week);

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('lesson', 'homework', 'bring', 'note')),
  subject text check (subject is null or length(subject) <= 100),
  text text not null check (length(text) between 1 and 1000),
  done boolean not null default false,
  sort int not null default 0
);

create index plan_items_member_date_idx on public.plan_items (member_id, date);
create index plan_items_document_idx on public.plan_items (document_id);

alter table public.documents enable row level security;
alter table public.plan_items enable row level security;

-- plan_items.member_id must equal its document's member_id.
-- security definer so the lookup isn't filtered by the caller's RLS.
create function public.plan_items_check_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.member_id is distinct from (select d.member_id from public.documents d where d.id = new.document_id) then
    raise exception 'plan_items.member_id must match the document''s member_id'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger plan_items_member_matches_document
  before insert or update of member_id, document_id on public.plan_items
  for each row execute function public.plan_items_check_member();

-- Non-parents may change only `done`: compare both rows with `done` stripped.
create function public.plan_items_children_done_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_parent() and (to_jsonb(new) - 'done') is distinct from (to_jsonb(old) - 'done') then
    raise exception 'only "done" can be changed on a plan item'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger plan_items_children_done_only
  before update on public.plan_items
  for each row execute function public.plan_items_children_done_only();

revoke execute on function public.plan_items_check_member() from public, anon, authenticated;
revoke execute on function public.plan_items_children_done_only() from public, anon, authenticated;

-- documents
create policy "documents: parents all"
  on public.documents for all to authenticated
  using (public.is_parent())
  with check (public.is_parent());

create policy "documents: child reads own published"
  on public.documents for select to authenticated
  using (member_id = public.current_member_id() and status = 'published');

-- plan_items
create policy "plan_items: parents all"
  on public.plan_items for all to authenticated
  using (public.is_parent())
  with check (public.is_parent());

create policy "plan_items: child reads own published"
  on public.plan_items for select to authenticated
  using (
    member_id = public.current_member_id()
    and exists (select 1 from public.documents d where d.id = document_id and d.status = 'published')
  );

create policy "plan_items: child marks own done"
  on public.plan_items for update to authenticated
  using (
    member_id = public.current_member_id()
    and exists (select 1 from public.documents d where d.id = document_id and d.status = 'published')
  )
  with check (member_id = public.current_member_id());

revoke all on public.documents from anon;
revoke all on public.plan_items from anon;

-- Storage: private bucket, path `<member_id>/<document_id>.<ext>`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "documents: parents read files"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.is_parent());

create policy "documents: parents upload files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_parent());

create policy "documents: parents update files"
  on storage.objects for update to authenticated
  using (bucket_id = 'documents' and public.is_parent())
  with check (bucket_id = 'documents' and public.is_parent());

create policy "documents: parents delete files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_parent());

create policy "documents: child reads own published files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.file_path = storage.objects.name
        and d.member_id = public.current_member_id()
        and d.status = 'published'
    )
  );
