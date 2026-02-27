
-- 1. Create auto-link function for inquiries (similar to auto_link_booking_contact)
CREATE OR REPLACE FUNCTION public.auto_link_inquiry_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  matched_contact_id uuid;
BEGIN
  IF NEW.contact_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.contact_name IS DISTINCT FROM OLD.contact_name) THEN
    -- Try exact match on contact full name
    SELECT id INTO matched_contact_id
    FROM public.contacts
    WHERE lower(trim(first_name || ' ' || last_name)) = lower(trim(NEW.contact_name))
    LIMIT 1;

    -- If no match, try matching against company name -> first contact
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

-- 2. Create trigger on inquiries table
DROP TRIGGER IF EXISTS trg_auto_link_inquiry_contact ON public.inquiries;
CREATE TRIGGER trg_auto_link_inquiry_contact
  BEFORE INSERT OR UPDATE ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_inquiry_contact();

-- 3. Fix all existing unlinked inquiries by matching on contact_name
UPDATE public.inquiries i
SET contact_id = c.id
FROM public.contacts c
WHERE i.contact_id IS NULL
  AND lower(trim(c.first_name || ' ' || c.last_name)) = lower(trim(i.contact_name));
