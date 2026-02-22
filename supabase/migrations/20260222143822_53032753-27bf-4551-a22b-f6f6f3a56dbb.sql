
-- Add reservation number sequence
CREATE SEQUENCE IF NOT EXISTS public.booking_number_seq START WITH 1;

-- Add new columns to bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reservation_number text,
  ADD COLUMN IF NOT EXISTS guest_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS room_setup text,
  ADD COLUMN IF NOT EXISTS requirements text,
  ADD COLUMN IF NOT EXISTS preparation_status text NOT NULL DEFAULT 'pending';

-- Backfill existing bookings with reservation numbers
DO $$
DECLARE
  rec RECORD;
  seq_val integer;
BEGIN
  FOR rec IN SELECT id FROM public.bookings ORDER BY created_at ASC
  LOOP
    seq_val := nextval('public.booking_number_seq');
    UPDATE public.bookings SET reservation_number = 'RES-' || LPAD(seq_val::text, 6, '0') WHERE id = rec.id;
  END LOOP;
END $$;

-- Create trigger to auto-assign reservation number on insert
CREATE OR REPLACE FUNCTION public.assign_reservation_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.reservation_number IS NULL THEN
    NEW.reservation_number := 'RES-' || LPAD(nextval('public.booking_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_assign_reservation_number
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_reservation_number();
