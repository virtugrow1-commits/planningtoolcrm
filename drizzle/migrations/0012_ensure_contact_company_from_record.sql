CREATE OR REPLACE FUNCTION public.ensure_contact_company_from_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contact_company_id uuid;
  v_contact_user_id uuid;
  v_company_name text;
BEGIN
  IF NEW.contact_id IS NULL OR NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bestaande koppeling (actief of uit dienst) ongemoeid laten
  IF EXISTS (
    SELECT 1 FROM public.contact_companies
    WHERE contact_id = NEW.contact_id AND company_id = NEW.company_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT company_id, user_id
    INTO v_contact_company_id, v_contact_user_id
    FROM public.contacts
   WHERE id = NEW.contact_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT name
    INTO v_company_name
    FROM public.companies
   WHERE id = NEW.company_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_contact_company_id IS NULL THEN
    INSERT INTO public.contact_companies (contact_id, company_id, is_primary, user_id)
    VALUES (NEW.contact_id, NEW.company_id, true, COALESCE(NEW.user_id, v_contact_user_id))
    ON CONFLICT (contact_id, company_id) DO NOTHING;

    UPDATE public.contacts
       SET company_id = NEW.company_id,
           company = COALESCE(NULLIF(trim(company), ''), v_company_name)
     WHERE id = NEW.contact_id
       AND company_id IS NULL;
  ELSE
    INSERT INTO public.contact_companies (contact_id, company_id, is_primary, user_id)
    VALUES (NEW.contact_id, NEW.company_id, false, COALESCE(NEW.user_id, v_contact_user_id))
    ON CONFLICT (contact_id, company_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_inquiries_ensure_contact_company ON public.inquiries;
CREATE TRIGGER trg_inquiries_ensure_contact_company
  AFTER INSERT OR UPDATE OF contact_id, company_id ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_contact_company_from_record();

DROP TRIGGER IF EXISTS trg_bookings_ensure_contact_company ON public.bookings;
CREATE TRIGGER trg_bookings_ensure_contact_company
  AFTER INSERT OR UPDATE OF contact_id, company_id ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_contact_company_from_record();