
-- Add company_id to inquiries table
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- Add company_id to bookings table  
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- Backfill inquiries: set company_id from linked contact's company_id
UPDATE public.inquiries i
SET company_id = c.company_id
FROM public.contacts c
WHERE i.contact_id = c.id
  AND c.company_id IS NOT NULL
  AND i.company_id IS NULL;

-- Backfill bookings: set company_id from linked contact's company_id
UPDATE public.bookings b
SET company_id = c.company_id
FROM public.contacts c
WHERE b.contact_id = c.id
  AND c.company_id IS NOT NULL
  AND b.company_id IS NULL;

-- Create trigger to auto-set company_id from contact on insert/update
CREATE OR REPLACE FUNCTION public.auto_set_company_from_contact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- If company_id is not explicitly set but contact_id is, inherit from contact
  IF NEW.company_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM public.contacts
    WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inquiry_auto_company
  BEFORE INSERT OR UPDATE ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_company_from_contact();

CREATE TRIGGER trg_booking_auto_company
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_company_from_contact();
