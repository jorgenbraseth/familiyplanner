#!/usr/bin/env bash
# Tests the data conversion of migration 20261102090000_member_calendars.sql: applies every
# migration BEFORE it, inserts members with an old-style calendar_id, applies the migration and
# checks that calendar_ids got the copies. Made-up data only.
# Not part of run.sh (which applies all migrations first); run it by hand when that migration changes:
#   bash supabase/tests/migration_member_calendars.sh                  starts a temp cluster
#   DATABASE_URL=postgres://... bash supabase/tests/migration_member_calendars.sh   EMPTY database
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
target=20261102090000_member_calendars.sql
cluster=""
pgrun=()

cleanup() {
  if [ -n "$cluster" ]; then
    "${pgrun[@]}" "$PGBIN/pg_ctl" -D "$cluster/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$cluster"
  fi
}
trap cleanup EXIT

if [ -z "${DATABASE_URL:-}" ]; then
  PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
  [ -x "$PGBIN/initdb" ] || { echo "PostgreSQL binaries not found; set PGBIN or DATABASE_URL" >&2; exit 1; }
  port="${PGPORT_TEST:-55434}"
  cluster="$(mktemp -d)"
  chmod 755 "$cluster"
  if [ "$(id -u)" = 0 ]; then
    chown postgres "$cluster" 2>/dev/null || { id postgres >/dev/null 2>&1 || useradd -m postgres; chown postgres "$cluster"; }
    pgrun=(runuser -u postgres --)
  fi
  "${pgrun[@]}" "$PGBIN/initdb" -D "$cluster/data" -U postgres --auth=trust >/dev/null
  "${pgrun[@]}" "$PGBIN/pg_ctl" -D "$cluster/data" -w -l "$cluster/log" \
    -o "-p $port -k $cluster -c listen_addresses=''" start >/dev/null
  DATABASE_URL="postgresql://postgres@/postgres?host=$cluster&port=$port"
fi

psql_run() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

psql_run -f "$root/supabase/tests/supabase_stubs.sql"
for f in "$root"/supabase/migrations/*.sql; do
  [ "$(basename "$f")" = "$target" ] && break
  psql_run -f "$f"
done

echo "== old-style data"
psql_run <<'SQL'
insert into public.members (name, email, role, calendar_id) values
  ('Cal A', 'cal.a@example.com', 'child', ' kid.a@example.com '),
  ('Cal B', 'cal.b@example.com', 'child', ''),
  ('Cal C', 'cal.c@example.com', 'child', null);
SQL

echo "== migration"
psql_run -f "$root/supabase/migrations/$target"

echo "== check"
psql_run <<'SQL'
do $$
declare ids text[];
begin
  select calendar_ids into ids from public.members where email = 'cal.a@example.com';
  if ids is distinct from array['kid.a@example.com'] then raise exception 'calendar_id not copied: %', ids; end if;
  select calendar_ids into ids from public.members where email = 'cal.b@example.com';
  if ids <> '{}' then raise exception 'blank calendar_id copied: %', ids; end if;
  select calendar_ids into ids from public.members where email = 'cal.c@example.com';
  if ids <> '{}' then raise exception 'null calendar_id copied: %', ids; end if;
end $$;
SQL
echo "migration_member_calendars: all checks passed"
