-- Auto-link booking contact_id based on contact_name matching contacts or companies
CREATE OR REPLACE FUNCTION public.auto_link_booking_contact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  matched_contact_id uuid;
BEGIN
  -- Only run if contact_id is null or contact_name changed
  IF NEW.contact_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.contact_name IS DISTINCT FROM OLD.contact_name) THEN
    -- First try exact match on contact full name
    SELECT id INTO matched_contact_id
    FROM public.contacts
    WHERE lower(trim(first_name || ' ' || last_name)) = lower(trim(NEW.contact_name))
    LIMIT 1;

    -- If no match, try matching against company name -> first contact of that company
    IF matched_contact_id IS NULL THEN
      SELECT c.id INTO matched_contact_id
      FROM public.companies co
      JOIN public.contacts c ON c.company_id = co.id
      WHERE lower(trim(co.name)) = lower(trim(NEW.contact_name))
      ORDER BY c.created_at ASC
      LIMIT 1;
    END IF;

    IF matched_contact_id IS NOT NULL THEN
      NEW.contact_id := matched_contact_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Create trigger
DROP TRIGGER IF EXISTS auto_link_booking_contact_trigger ON public.bookings;
CREATE TRIGGER auto_link_booking_contact_trigger
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.auto_link_booking_contact();