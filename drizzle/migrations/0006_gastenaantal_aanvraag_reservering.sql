-- Aantal gasten gelijk houden tussen aanvraag en reserveringen.
--
-- Probleem: de offerte en reserveringsbevestiging nemen het aantal gasten van de
-- reservering (per zaal) en anders dat van de aanvraag. Werd het aantal daarna
-- alleen op de aanvraag aangepast, dan bleef de reservering het oude aantal
-- houden en kwam de wijziging nooit in de documenten.
--
-- Regel: een wijziging op de aanvraag gaat mee naar de reserveringen van die
-- aanvraag die nog het oude aantal hadden, en andersom. Reserveringen met een
-- afwijkend aantal (bijv. een aparte zaal voor een deel van de groep) blijven staan.

CREATE OR REPLACE FUNCTION public.sync_guest_count_inquiry_to_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.guest_count IS DISTINCT FROM OLD.guest_count AND COALESCE(NEW.guest_count, 0) > 0 THEN
    UPDATE public.bookings
       SET guest_count = NEW.guest_count
     WHERE inquiry_id = NEW.id
       AND status IN ('option', 'confirmed')
       AND COALESCE(guest_count, 0) IN (COALESCE(OLD.guest_count, 0), 0);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_guest_count_booking_to_inquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.inquiry_id IS NOT NULL
     AND NEW.guest_count IS DISTINCT FROM OLD.guest_count
     AND COALESCE(NEW.guest_count, 0) > 0 THEN
    UPDATE public.inquiries
       SET guest_count = NEW.guest_count
     WHERE id = NEW.inquiry_id
       AND COALESCE(guest_count, 0) IN (COALESCE(OLD.guest_count, 0), 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_guest_count_inquiry_to_bookings ON public.inquiries;
CREATE TRIGGER trg_sync_guest_count_inquiry_to_bookings
  AFTER UPDATE OF guest_count ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.sync_guest_count_inquiry_to_bookings();

DROP TRIGGER IF EXISTS trg_sync_guest_count_booking_to_inquiry ON public.bookings;
CREATE TRIGGER trg_sync_guest_count_booking_to_inquiry
  AFTER UPDATE OF guest_count ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_guest_count_booking_to_inquiry();
