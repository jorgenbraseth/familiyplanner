-- Children may request any number of stars per day: remove the daily request limit.
-- (The routine one-per-slot-per-day rule and the assistant's daily question limit are separate and stay.)
drop trigger if exists stars_daily_limit on public.stars;
drop function if exists public.stars_daily_limit();
drop function if exists public.star_request_daily_limit();
