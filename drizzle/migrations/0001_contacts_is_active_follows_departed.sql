-- contacts.is_active (added 29-09, exposed by crm-read-api) was only filled once.
-- Keep it equal to NOT departed on every insert/update, and fix existing rows.
-- Idempotent.
CREATE OR REPLACE FUNCTION public.contacts_sync_is_active()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.is_active := NOT COALESCE(NEW.departed, false);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contacts_sync_is_active ON public.contacts;
CREATE TRIGGER trg_contacts_sync_is_active
  BEFORE INSERT OR UPDATE OF departed, is_active ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_sync_is_active();

UPDATE public.contacts SET is_active = NOT COALESCE(departed, false)
WHERE is_active IS DISTINCT FROM NOT COALESCE(departed, false);
