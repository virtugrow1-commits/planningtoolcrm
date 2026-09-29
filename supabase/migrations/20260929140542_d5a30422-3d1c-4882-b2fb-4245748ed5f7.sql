ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS infix text, ADD COLUMN IF NOT EXISTS mobile text, ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
UPDATE public.contacts SET is_active = NOT departed WHERE departed;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS title text, ADD COLUMN IF NOT EXISTS last_contact_at date, ADD COLUMN IF NOT EXISTS next_action_at date, ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_scope text NOT NULL DEFAULT 'customer';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_task_scope_check') THEN ALTER TABLE public.tasks ADD CONSTRAINT tasks_task_scope_check CHECK (task_scope IN ('customer','request')); END IF; END $$;
UPDATE public.tasks SET task_scope='request' WHERE inquiry_id IS NOT NULL AND task_scope<>'request';
CREATE OR REPLACE FUNCTION public.set_task_scope() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.task_scope := CASE WHEN NEW.inquiry_id IS NOT NULL THEN 'request' ELSE 'customer' END; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_set_task_scope ON public.tasks;
CREATE TRIGGER trg_set_task_scope BEFORE INSERT OR UPDATE OF inquiry_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_task_scope();

CREATE TABLE IF NOT EXISTS public.inquiry_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  role text,
  is_primary boolean NOT NULL DEFAULT false,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inquiry_id, contact_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inquiry_contacts TO authenticated;
GRANT ALL ON public.inquiry_contacts TO service_role;
ALTER TABLE public.inquiry_contacts ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS inquiry_contacts_one_primary ON public.inquiry_contacts(inquiry_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS inquiry_contacts_contact ON public.inquiry_contacts(contact_id);
CREATE POLICY "Org members manage inquiry_contacts" ON public.inquiry_contacts FOR ALL TO authenticated
 USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = private.get_user_organization_id(auth.uid())))
 WITH CHECK (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = private.get_user_organization_id(auth.uid())));
INSERT INTO public.inquiry_contacts (inquiry_id, contact_id, is_primary, user_id)
 SELECT i.id, i.contact_id, true, i.user_id FROM public.inquiries i JOIN public.contacts c ON c.id=i.contact_id
 ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.inquiry_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  actor_id uuid,
  actor_name text,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.inquiry_history TO authenticated;
GRANT ALL ON public.inquiry_history TO service_role;
ALTER TABLE public.inquiry_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS inquiry_history_inq ON public.inquiry_history(inquiry_id, created_at DESC);
CREATE POLICY "Org members view inquiry_history" ON public.inquiry_history FOR SELECT TO authenticated
 USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = private.get_user_organization_id(auth.uid())));
CREATE POLICY "Org members add inquiry_history" ON public.inquiry_history FOR INSERT TO authenticated
 WITH CHECK (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = private.get_user_organization_id(auth.uid())));

CREATE OR REPLACE FUNCTION public.log_inquiry_history(_inq uuid, _owner uuid, _action text, _details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _name text;
BEGIN
  IF _inq IS NULL THEN RETURN; END IF;
  SELECT display_name INTO _name FROM profiles WHERE id = auth.uid();
  INSERT INTO inquiry_history(inquiry_id,user_id,actor_id,actor_name,action,details)
  VALUES (_inq,_owner,auth.uid(),COALESCE(_name, CASE WHEN auth.uid() IS NULL THEN 'Systeem' END),_action,_details);
END $$;
REVOKE EXECUTE ON FUNCTION public.log_inquiry_history(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_inquiry_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_TABLE_NAME='inquiries' THEN
    IF TG_OP='INSERT' THEN PERFORM log_inquiry_history(NEW.id,NEW.user_id,'Aanvraag aangemaakt',NULL);
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN PERFORM log_inquiry_history(NEW.id,NEW.user_id,'Status gewijzigd',jsonb_build_object('from',OLD.status,'to',NEW.status)); END IF;
  ELSIF TG_TABLE_NAME='inquiry_contacts' THEN
    IF TG_OP='INSERT' THEN PERFORM log_inquiry_history(NEW.inquiry_id,NEW.user_id,'Contactpersoon toegevoegd',jsonb_build_object('contact',(SELECT trim(first_name||' '||last_name) FROM contacts WHERE id=NEW.contact_id)));
    ELSIF TG_OP='DELETE' THEN PERFORM log_inquiry_history(OLD.inquiry_id,OLD.user_id,'Contactpersoon verwijderd',jsonb_build_object('contact',(SELECT trim(first_name||' '||last_name) FROM contacts WHERE id=OLD.contact_id))); RETURN OLD; END IF;
  ELSIF TG_TABLE_NAME='tasks' THEN
    IF TG_OP='INSERT' THEN PERFORM log_inquiry_history(NEW.inquiry_id,NEW.user_id,'Taak aangemaakt',jsonb_build_object('title',NEW.title));
    ELSIF NEW.status='completed' AND OLD.status<>'completed' THEN PERFORM log_inquiry_history(NEW.inquiry_id,NEW.user_id,'Taak afgerond',jsonb_build_object('title',NEW.title)); END IF;
  ELSIF TG_TABLE_NAME='bookings' THEN
    IF TG_OP='INSERT' THEN PERFORM log_inquiry_history(NEW.inquiry_id,NEW.user_id,'Reservering aangemaakt',jsonb_build_object('date',NEW.date,'room',NEW.room_name));
    ELSIF (NEW.date,NEW.start_hour,NEW.end_hour,NEW.room_name,NEW.status) IS DISTINCT FROM (OLD.date,OLD.start_hour,OLD.end_hour,OLD.room_name,OLD.status) THEN
      PERFORM log_inquiry_history(NEW.inquiry_id,NEW.user_id,'Reservering gewijzigd',jsonb_build_object('date',NEW.date,'room',NEW.room_name,'status',NEW.status)); END IF;
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
REVOKE EXECUTE ON FUNCTION public.trg_inquiry_history() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS inquiry_history_inq ON public.inquiries;
CREATE TRIGGER inquiry_history_inq AFTER INSERT OR UPDATE OF status ON public.inquiries FOR EACH ROW EXECUTE FUNCTION public.trg_inquiry_history();
DROP TRIGGER IF EXISTS inquiry_history_ic ON public.inquiry_contacts;
CREATE TRIGGER inquiry_history_ic AFTER INSERT OR DELETE ON public.inquiry_contacts FOR EACH ROW EXECUTE FUNCTION public.trg_inquiry_history();
DROP TRIGGER IF EXISTS inquiry_history_task ON public.tasks;
CREATE TRIGGER inquiry_history_task AFTER INSERT OR UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.trg_inquiry_history();
DROP TRIGGER IF EXISTS inquiry_history_booking ON public.bookings;
CREATE TRIGGER inquiry_history_booking AFTER INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.trg_inquiry_history();

CREATE OR REPLACE FUNCTION public.sync_inquiry_primary_contact() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.contact_id IS DISTINCT FROM OLD.contact_id) THEN
    UPDATE inquiry_contacts SET is_primary=false WHERE inquiry_id=NEW.id AND is_primary AND contact_id<>NEW.contact_id;
    INSERT INTO inquiry_contacts(inquiry_id,contact_id,is_primary,user_id) VALUES (NEW.id,NEW.contact_id,true,NEW.user_id)
    ON CONFLICT (inquiry_id,contact_id) DO UPDATE SET is_primary=true;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.sync_inquiry_primary_contact() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS inquiry_primary_contact ON public.inquiries;
CREATE TRIGGER inquiry_primary_contact AFTER INSERT OR UPDATE OF contact_id ON public.inquiries FOR EACH ROW EXECUTE FUNCTION public.sync_inquiry_primary_contact();