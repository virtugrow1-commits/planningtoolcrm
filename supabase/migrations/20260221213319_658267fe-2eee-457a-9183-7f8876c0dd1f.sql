
-- Auto-link company_id on insert/update when company name matches
CREATE OR REPLACE FUNCTION public.auto_link_company_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  matched_company_id uuid;
BEGIN
  -- Only run if company name changed or company_id is null
  IF NEW.company IS NOT NULL AND (NEW.company_id IS NULL OR TG_OP = 'INSERT' OR NEW.company IS DISTINCT FROM OLD.company) THEN
    SELECT id INTO matched_company_id
    FROM public.companies
    WHERE lower(trim(name)) = lower(trim(NEW.company))
    LIMIT 1;

    IF matched_company_id IS NOT NULL THEN
      NEW.company_id := matched_company_id;
    END IF;
  END IF;

  -- Auto-capitalize first_name and last_name
  IF NEW.first_name IS NOT NULL THEN
    NEW.first_name := initcap(NEW.first_name);
  END IF;
  IF NEW.last_name IS NOT NULL THEN
    NEW.last_name := initcap(NEW.last_name);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_link_company_and_capitalize
BEFORE INSERT OR UPDATE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.auto_link_company_id();
