
ALTER TABLE public.bookings ADD COLUMN start_minute integer NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN end_minute integer NOT NULL DEFAULT 0;
