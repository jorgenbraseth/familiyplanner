# Migrations

One SQL file per schema change, named `<UTC timestamp>_<what>.sql` (e.g. `20261021120000_members.sql`,
what `supabase migration new <what>` creates). Never edit a migration that has been applied; add a new one.

Apply with the Supabase CLI (`supabase link --project-ref <ref>` then `supabase db push`) or paste the
file into the SQL editor. Every table gets RLS enabled in the same migration that creates it.

## Deploy and tests

- `.github/workflows/supabase.yml` runs `supabase db push` on pushes to `main` that touch this folder
  (and on demand from the Actions tab). It needs the repo secrets in docs/SETUP.md section 8 and
  skips with a notice if they are missing. `supabase/seed.sql` is never pushed; run it by hand once.
- `bash supabase/tests/run.sh` applies Supabase stubs, every migration in order, the seed and the RLS tests
  (`supabase/tests/*_rls.sql`) to a throwaway local PostgreSQL. With `DATABASE_URL` set it uses that empty
  database instead (CI does this in the `database` job). Add a `*_rls.sql` test with each new table.
