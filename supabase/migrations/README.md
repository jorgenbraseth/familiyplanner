# Migrations

One SQL file per schema change, named `<UTC timestamp>_<what>.sql` (e.g. `20261021120000_members.sql`,
what `supabase migration new <what>` creates). Never edit a migration that has been applied; add a new one.

Apply with the Supabase CLI (`supabase link --project-ref <ref>` then `supabase db push`) or paste the
file into the SQL editor. Every table gets RLS enabled in the same migration that creates it.
