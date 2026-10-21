-- Emulates the bits of Supabase the migrations rely on, for plain-Postgres tests.
-- Run BEFORE the migrations. Not for a real Supabase project.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email'
$$;
grant execute on function auth.email() to anon, authenticated;

-- Supabase grants everything on public to anon/authenticated by default; RLS does the limiting.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
