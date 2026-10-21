#!/usr/bin/env bash
# Applies stubs + all migrations + seed + tests to a throwaway Postgres.
#   bash supabase/tests/run.sh                      starts a temp cluster (needs PostgreSQL binaries)
#   DATABASE_URL=postgres://... bash supabase/tests/run.sh   uses an existing EMPTY database (CI)
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
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
  port="${PGPORT_TEST:-55432}"
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

echo "== stubs"
psql_run -f "$root/supabase/tests/supabase_stubs.sql"
for f in "$root"/supabase/migrations/*.sql; do
  echo "== migration $(basename "$f")"
  psql_run -f "$f"
done
echo "== seed"
psql_run -f "$root/supabase/seed.sql"
echo "== tests"
for t in "$root"/supabase/tests/*.sql; do
  [ "$(basename "$t")" = supabase_stubs.sql ] && continue
  psql_run -f "$t"
done
