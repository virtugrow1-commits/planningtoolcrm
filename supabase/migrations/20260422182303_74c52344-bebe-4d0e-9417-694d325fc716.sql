-- 1. Deduplicate room_settings: keep the row with the highest max_guests per (user_id, room_name)
DELETE FROM public.room_settings a
USING public.room_settings b
WHERE a.user_id = b.user_id
  AND a.room_name = b.room_name
  AND (
    a.max_guests < b.max_guests
    OR (a.max_guests = b.max_guests AND a.created_at < b.created_at)
  );

-- 2. Add UNIQUE constraint to prevent future duplicates
ALTER TABLE public.room_settings
  ADD CONSTRAINT room_settings_user_room_unique UNIQUE (user_id, room_name);

-- 3. Cleanup stuck sync_queue items
DELETE FROM public.sync_queue
WHERE last_error ILIKE '%kalender is inactief%'
   OR last_error ILIKE '%calendar%inactive%'
   OR last_error ILIKE '%calendar_inactive%'
   OR retry_count >= max_retries;