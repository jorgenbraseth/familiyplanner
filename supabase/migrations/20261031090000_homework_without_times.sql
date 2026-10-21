-- Homework never has a time of day. Clear times saved on homework items before this was enforced.
-- Runs without a signed-in member, so the "children change only done" trigger does not fire.
update public.plan_items
   set starts_at = null, ends_at = null
 where kind = 'homework' and (starts_at is not null or ends_at is not null);
