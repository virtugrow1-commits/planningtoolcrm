
-- Fix: Update the auto-link function to also try matching without common Dutch prefixes (de, van, van de, etc.)
CREATE OR REPLACE FUNCTION public.auto_link_inquiry_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  matched_contact_id uuid;
  clean_name text;
BEGIN
  IF NEW.contact_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.contact_name IS DISTINCT FROM OLD.contact_name) THEN
    clean_name := lower(trim(NEW.contact_name));
    
    -- Try exact match on contact full name
    SELECT id INTO matched_contact_id
    FROM public.contacts
    WHERE lower(trim(first_name || ' ' || last_name)) = clean_name
    LIMIT 1;

    -- Try match ignoring common Dutch prefixes (de, van, van de, van den, van der, etc.)
    IF matched_contact_id IS NULL THEN
      SELECT id INTO matched_contact_id
      FROM public.contacts
      WHERE lower(trim(first_name)) = split_part(clean_name, ' ', 1)
        AND lower(trim(last_name)) = regexp_replace(clean_name, '^[^ ]+ (de |het |van |van de |van den |van der |den |ter )*', '')
      LIMIT 1;
    END IF;

    -- Try matching against company name -> first contact
    IF matched_contact_id IS NULL THEN
      SELECT c.id INTO matched_contact_id
      FROM public.companies co
      JOIN public.contacts c ON c.company_id = co.id
      WHERE lower(trim(co.name)) = clean_name
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

-- Now fix Linda specifically
UPDATE public.inquiries 
SET contact_id = 'a87a7d68-d10f-4119-9795-15242123fbd5'
WHERE id = 'eca23ff0-aada-414b-a9d3-c1350745d6f7' AND contact_id IS NULL;

-- Also try to fix other unlinked inquiries with the improved matching
UPDATE public.inquiries i
SET contact_id = sub.cid
FROM (
  SELECT i2.id as iid, c.id as cid
  FROM public.inquiries i2
  JOIN public.contacts c ON (
    lower(trim(c.first_name || ' ' || c.last_name)) = lower(trim(i2.contact_name))
    OR (
      lower(trim(c.first_name)) = split_part(lower(trim(i2.contact_name)), ' ', 1)
      AND lower(trim(c.last_name)) = regexp_replace(lower(trim(i2.contact_name)), '^[^ ]+ (de |het |van |van de |van den |van der |den |ter )*', '')
    )
  )
  WHERE i2.contact_id IS NULL
) sub
WHERE i.id = sub.iid;
