-- When a routine list shows on the child's overview and on the family screen: from / until (Copenhagen wall-clock time).
-- null = the slot's default (the app resolves it: morning 00:00-10:00, evening 18:00-24:00). The app always saves both.
-- Existing RLS on routine_settings already covers this: parents write ("parents all"), the child reads their own row,
-- the family reads all (family_wide_reads). The screen session is not a parent, so it can't change them.
alter table public.routine_settings
  add column visible_from time,
  add column visible_until time;

alter table public.routine_settings
  add constraint routine_settings_visible_window
    check (visible_from is null or visible_until is null or visible_from < visible_until);
