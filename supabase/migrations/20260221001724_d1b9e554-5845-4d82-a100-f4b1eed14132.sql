
-- Add GHL event ID to bookings for sync tracking
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS ghl_event_id TEXT;
CREATE INDEX IF NOT EXISTS idx_bookings_ghl_event_id ON public.bookings (ghl_event_id);
