
-- Add display_name column to room_settings for custom room naming
ALTER TABLE public.room_settings ADD COLUMN display_name text;
