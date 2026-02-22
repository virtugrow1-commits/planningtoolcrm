
-- Sequences for display numbers
CREATE SEQUENCE IF NOT EXISTS public.contact_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.company_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.inquiry_number_seq START 1;

-- Add display_number columns
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS display_number text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS display_number text;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS display_number text;

-- Auto-assign contact number
CREATE OR REPLACE FUNCTION public.assign_contact_number()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.display_number IS NULL THEN
    NEW.display_number := 'CON-' || LPAD(nextval('public.contact_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_contact_number
BEFORE INSERT ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.assign_contact_number();

-- Auto-assign company number
CREATE OR REPLACE FUNCTION public.assign_company_number()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.display_number IS NULL THEN
    NEW.display_number := 'BED-' || LPAD(nextval('public.company_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_company_number
BEFORE INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.assign_company_number();

-- Auto-assign inquiry number
CREATE OR REPLACE FUNCTION public.assign_inquiry_number()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.display_number IS NULL THEN
    NEW.display_number := 'ANV-' || LPAD(nextval('public.inquiry_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_inquiry_number
BEFORE INSERT ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION public.assign_inquiry_number();

-- Backfill existing records
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn FROM public.contacts WHERE display_number IS NULL
)
UPDATE public.contacts SET display_number = 'CON-' || LPAD(numbered.rn::text, 6, '0')
FROM numbered WHERE contacts.id = numbered.id;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn FROM public.companies WHERE display_number IS NULL
)
UPDATE public.companies SET display_number = 'BED-' || LPAD(numbered.rn::text, 6, '0')
FROM numbered WHERE companies.id = numbered.id;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn FROM public.inquiries WHERE display_number IS NULL
)
UPDATE public.inquiries SET display_number = 'ANV-' || LPAD(numbered.rn::text, 6, '0')
FROM numbered WHERE inquiries.id = numbered.id;

-- Advance sequences past existing records
SELECT setval('public.contact_number_seq', COALESCE((SELECT COUNT(*) FROM public.contacts), 0) + 1, false);
SELECT setval('public.company_number_seq', COALESCE((SELECT COUNT(*) FROM public.companies), 0) + 1, false);
SELECT setval('public.inquiry_number_seq', COALESCE((SELECT COUNT(*) FROM public.inquiries), 0) + 1, false);
