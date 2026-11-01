-- Emulates the bits of Supabase the migrations and the mock REST/auth gateway rely on (scripts/mock).
-- Applied BEFORE the migrations on a throwaway Postgres. Not for a real Supabase project.
-- Unlike supabase/tests/supabase_stubs.sql, auth.uid()/email()/jwt()/role() read request.jwt.claims
-- like real Supabase, and service_role bypasses RLS.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  created_at timestamptz not null default now()
);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create or replace function auth.email() returns text language sql stable as $$
  select nullif(auth.jwt() ->> 'email', '')
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(auth.jwt() ->> 'role', '')
$$;
grant execute on function auth.jwt(), auth.uid(), auth.email(), auth.role() to anon, authenticated, service_role;

-- Supabase grants everything on public to the API roles; RLS does the limiting.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Storage: just the tables/columns the migrations and policies touch.
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

-- Helper for the mock REST server: PostgREST's "JSON object requested" (406) check, raised inside the
-- request's transaction so a mutation is rolled back.
create schema if not exists mock;
grant usage on schema mock to anon, authenticated, service_role;
create or replace function mock.assert_single(n bigint) returns boolean language plpgsql as $$
begin
  if n <> 1 then
    raise exception 'PGRST116:%', n using errcode = 'P0001';
  end if;
  return true;
end $$;
grant execute on function mock.assert_single(bigint) to anon, authenticated, service_role;
