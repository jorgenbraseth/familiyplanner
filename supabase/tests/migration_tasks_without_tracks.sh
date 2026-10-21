#!/usr/bin/env bash
# Tests the data conversion of migration 20261029090000_tasks_without_tracks.sql: applies every
# migration BEFORE it, inserts old-style data (tasks on tracks, duplicates across tracks), applies
# the migration (twice, it must be idempotent) and checks the result. Made-up data only.
# Not part of run.sh (which applies all migrations first); run it by hand when that migration changes:
#   bash supabase/tests/migration_tasks_without_tracks.sh                  starts a temp cluster
#   DATABASE_URL=postgres://... bash supabase/tests/migration_tasks_without_tracks.sh   EMPTY database
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
target=20261029090000_tasks_without_tracks.sql
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
  port="${PGPORT_TEST:-55433}"
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
# seed.sql follows the latest schema, so insert the first parent with columns this older schema has.
psql_run -c "insert into public.members (name, email, role) values ('Forelder', 'forelder@example.com', 'parent')"

echo "== old-style data"
psql_run <<'SQL'
insert into public.members (name, email, role) values
  ('Conv Child A', 'conv.a@example.com', 'child'),
  ('Conv Child B', 'conv.b@example.com', 'child');
do $$
declare a uuid; b uuid; ta1 uuid; ta2 uuid; tb uuid; k_old uuid; k_new uuid; k_solo uuid; kb uuid;
begin
  select id into a from public.members where email = 'conv.a@example.com';
  select id into b from public.members where email = 'conv.b@example.com';
  insert into public.star_tracks (member_id, name, goal, milestone_every, status, completed_at, created_at)
    values (a, 'old', 10, 5, 'completed', now(), now() - interval '30 days') returning id into ta1;
  insert into public.star_tracks (member_id, name, goal, milestone_every) values (a, 'new', 10, 5) returning id into ta2;
  insert into public.star_tracks (member_id, name, goal, milestone_every) values (b, 'b', 10, 5) returning id into tb;
  -- 'Tidy' exists on both of A's tracks with different values, B has its own 'Tidy'.
  insert into public.star_tasks (track_id, name, stars, created_at) values (ta1, 'Tidy', 2, now() - interval '30 days') returning id into k_old;
  insert into public.star_tasks (track_id, name, stars) values (ta2, 'Tidy', 5) returning id into k_new;
  insert into public.star_tasks (track_id, name, stars) values (ta1, 'OldOnly', 3) returning id into k_solo;
  insert into public.star_tasks (track_id, name, stars) values (tb, 'Tidy', 4) returning id into kb;
  insert into public.stars (track_id, member_id, reason, status, task_id, amount) values (ta1, a, 'Tidy', 'approved', k_old, 2);
  insert into public.stars (track_id, member_id, reason, status, task_id, amount) values (ta2, a, 'Tidy', 'approved', k_new, 5);
  insert into public.stars (track_id, member_id, reason, status, task_id, amount) values (ta1, a, 'OldOnly', 'approved', k_solo, 3);
  insert into public.stars (track_id, member_id, reason, status, task_id, amount) values (tb, b, 'Tidy', 'approved', kb, 4);
  insert into public.routine_settings (member_id, slot, star_task_id) values (a, 'morning', k_old);
end $$;
SQL

echo "== migration $target (twice)"
psql_run -f "$root/supabase/migrations/$target"
psql_run -f "$root/supabase/migrations/$target"

echo "== checks"
psql_run <<'SQL'
do $$
declare a uuid; b uuid; k uuid;
begin
  select id into a from public.members where email = 'conv.a@example.com';
  select id into b from public.members where email = 'conv.b@example.com';

  if (select count(*) from public.star_tasks where member_id = a and name = 'Tidy') <> 1 then
    raise exception 'duplicate tasks not merged';
  end if;
  select id into k from public.star_tasks where member_id = a and name = 'Tidy';
  if (select stars from public.star_tasks where id = k) <> 5 then
    raise exception 'the task on the active track should be the one kept';
  end if;
  if (select count(*) from public.star_tasks where member_id = a) <> 2 then
    raise exception 'child A should have 2 tasks (Tidy, OldOnly)';
  end if;
  if (select count(*) from public.star_tasks where member_id = b) <> 1 then
    raise exception 'child B''s task changed';
  end if;
  if (select count(*) from public.star_tasks where member_id is null) <> 0 then
    raise exception 'no all-children tasks expected after conversion';
  end if;

  if (select count(*) from public.stars where member_id = a and task_id = k) <> 2 then
    raise exception 'stars of the duplicate were not repointed to the kept task';
  end if;
  if (select count(*) from public.stars where task_id is null) <> 0 then
    raise exception 'a star lost its task';
  end if;
  -- repointing must not change any amount
  if (select sum(amount) from public.stars where member_id = a) <> 10 then
    raise exception 'amounts of child A changed';
  end if;
  if (select count(*) from public.stars where member_id = a and reason = 'Tidy' and amount = 2) <> 1 then
    raise exception 'the historical 2-star amount changed';
  end if;
  if (select star_task_id from public.routine_settings where member_id = a and slot = 'morning') is distinct from k then
    raise exception 'routine setting not repointed';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'star_tasks' and column_name = 'track_id') then
    raise exception 'track_id still exists';
  end if;
end $$;
SQL

echo "migration_tasks_without_tracks: all checks passed"
