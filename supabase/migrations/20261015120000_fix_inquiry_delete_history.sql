-- Fix: deleting an inquiry failed with a foreign key error.
-- Deleting an inquiry cascades to inquiry_contacts; the DELETE branch of
-- trg_inquiry_history then tried to log "Contactpersoon verwijderd" into
-- inquiry_history for the inquiry that was being deleted, which violates
-- inquiry_history_inquiry_id_fkey and rolls back the whole delete.
-- Result: aanvragen could not be removed in BUUT, and the auto-sync orphan
-- cleanup never removed inquiries whose CliqCRM opportunity had been deleted.
-- Only log the contact removal when the inquiry itself still exists.

CREATE OR REPLACE FUNCTION public.trg_inquiry_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_TABLE_NAME='inquiries' THEN
    IF TG_OP='INSERT' THEN PERFORM log_inquiry_history(NEW.id,NEW.user_id,'Aanvraag aangemaakt',NULL);
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN PERFORM log_inquiry_history(NEW.id,NEW.user_id,'Status gewijzigd',jsonb_build_object('from',OLD.status,'to',NEW.status)); END IF;
  ELSIF TG_TABLE_NAME='inquiry_contacts' THEN
    IF TG_OP='INSERT' THEN PERFORM log_inquiry_history(NEW.inquiry_id,NEW.user_id,'Contactpersoon toegevoegd',jsonb_build_object('contact',(SELECT trim(first_name||' '||last_name) FROM contacts WHERE id=NEW.contact_id)));
    ELSIF TG_OP='DELETE' THEN
      IF EXISTS (SELECT 1 FROM inquiries WHERE id = OLD.inquiry_id) THEN
        PERFORM log_inquiry_history(OLD.inquiry_id,OLD.user_id,'Contactpersoon verwijderd',jsonb_build_object('contact',(SELECT trim(first_name||' '||last_name) FROM contacts WHERE id=OLD.contact_id)));
      END IF;
      RETURN OLD;
    END IF;
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
