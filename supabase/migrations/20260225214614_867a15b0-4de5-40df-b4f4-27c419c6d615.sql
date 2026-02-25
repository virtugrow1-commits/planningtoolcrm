
-- Trigger to auto-insert into contact_companies when contacts.company_id is set
CREATE OR REPLACE FUNCTION public.sync_contact_company_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- When company_id is set or changed, ensure junction table has the link
  IF NEW.company_id IS NOT NULL THEN
    INSERT INTO public.contact_companies (contact_id, company_id, is_primary, user_id)
    VALUES (NEW.id, NEW.company_id, true, NEW.user_id)
    ON CONFLICT (contact_id, company_id) DO UPDATE SET is_primary = true;
  END IF;
  
  -- If company_id was cleared, mark old link as non-primary (don't remove)
  IF OLD IS NOT NULL AND OLD.company_id IS NOT NULL AND (NEW.company_id IS NULL OR NEW.company_id != OLD.company_id) THEN
    UPDATE public.contact_companies 
    SET is_primary = false 
    WHERE contact_id = NEW.id AND company_id = OLD.company_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_sync_contact_company_link
  AFTER INSERT OR UPDATE OF company_id ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_contact_company_link();
