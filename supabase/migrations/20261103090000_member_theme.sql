-- Colour theme as a per-member setting. The ids must match THEME_IDS in src/lib/themes.ts.
-- A non-parent may now change avatar_path and theme on their own row (nothing else); parents are unrestricted
-- (they already may update any member row).

alter table public.members add column if not exists theme text not null default 'skog';

alter table public.members drop constraint if exists members_theme_known;
alter table public.members add constraint members_theme_known check (
  theme in ('skog', 'fjord', 'godteri', 'kpop', 'morgengry', 'orden')
);

create or replace function public.members_limit_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.email() is not null and not public.is_parent()
     and (to_jsonb(new) - 'avatar_path' - 'theme') is distinct from (to_jsonb(old) - 'avatar_path' - 'theme') then
    raise exception 'members can only change their own avatar_path and theme' using errcode = '42501';
  end if;
  return new;
end
$$;
