-- Profile pictures. `members.avatar_path` points at a file in the private `avatars` storage bucket,
-- path `<member_id>/<name>.(webp|jpg|png)`. Everyone in the family can see every picture; a parent can
-- change anyone's, a member only their own (and, on the members row, only avatar_path).

alter table public.members add column if not exists avatar_path text;

alter table public.members drop constraint if exists members_avatar_path_format;
alter table public.members add constraint members_avatar_path_format check (
  avatar_path is null
  or (
    split_part(avatar_path, '/', 1) = id::text
    and avatar_path ~ '^[^/]+/[A-Za-z0-9_-]+\.(webp|jpg|png)$'
  )
);

-- A member may update their own row; the trigger below limits a non-parent to avatar_path only.
drop policy if exists "members: update own avatar" on public.members;
create policy "members: update own avatar"
  on public.members for update to authenticated
  using (id = public.current_member_id())
  with check (id = public.current_member_id());

create or replace function public.members_limit_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.email() is not null and not public.is_parent()
     and (to_jsonb(new) - 'avatar_path') is distinct from (to_jsonb(old) - 'avatar_path') then
    raise exception 'members can only change their own avatar_path' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists members_limit_self_update on public.members;
create trigger members_limit_self_update
  before update on public.members
  for each row execute function public.members_limit_self_update();

-- Storage: private bucket, small processed images only (the app sends 256x256 WebP/JPEG).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "avatars: family reads" on storage.objects;
create policy "avatars: family reads"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.current_member_id() is not null);

drop policy if exists "avatars: parents or owner insert" on storage.objects;
create policy "avatars: parents or owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (public.is_parent() or split_part(name, '/', 1) = public.current_member_id()::text)
  );

drop policy if exists "avatars: parents or owner update" on storage.objects;
create policy "avatars: parents or owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (public.is_parent() or split_part(name, '/', 1) = public.current_member_id()::text)
  )
  with check (
    bucket_id = 'avatars'
    and (public.is_parent() or split_part(name, '/', 1) = public.current_member_id()::text)
  );

drop policy if exists "avatars: parents or owner delete" on storage.objects;
create policy "avatars: parents or owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (public.is_parent() or split_part(name, '/', 1) = public.current_member_id()::text)
  );
