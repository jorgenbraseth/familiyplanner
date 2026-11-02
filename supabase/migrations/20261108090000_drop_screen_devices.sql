-- Owner: a device is never locked to being a family screen. Remove the device lock from
-- 20261104090000_family_screen.sql (the table, its trigger and the two functions).
drop function if exists public.register_screen_device();
drop function if exists public.screen_device_locked(uuid);
drop trigger if exists screen_devices_release on public.screen_devices;
drop table if exists public.screen_devices;
drop function if exists public.screen_devices_release();
