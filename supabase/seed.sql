-- First parent. Run once in the Supabase SQL editor after applying the migrations.
-- Everyone else is added from the app's members page (/medlemmer).
insert into public.members (name, email, role, calendar_ids, colour, locale)
values ('Jørgen', 'jorgen.braseth@gmail.com', 'parent', array['jorgen.braseth@gmail.com'], '#2563eb', 'nb-NO');
