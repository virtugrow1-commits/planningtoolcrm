ALTER TABLE public.task_automation_rules
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ghl',
  ADD COLUMN IF NOT EXISTS trigger_event text,
  ADD COLUMN IF NOT EXISTS offset_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offset_from text NOT NULL DEFAULT 'created',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS assigned_to text,
  ADD COLUMN IF NOT EXISTS description text;

CREATE OR REPLACE FUNCTION public.run_custom_task_automations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r record; ev text; base_date date; event_date date; due date; t_title text;
  v_inquiry uuid; v_booking uuid;
BEGIN
  IF TG_TABLE_NAME = 'inquiries' THEN
    ev := 'inquiry_created'; v_inquiry := NEW.id; v_booking := NULL;
    event_date := CASE WHEN NEW.preferred_date ~ '^\d{4}-\d{2}-\d{2}' THEN substr(NEW.preferred_date,1,10)::date END;
  ELSE
    ev := CASE WHEN NEW.status = 'option' THEN 'option_created' ELSE 'booking_created' END;
    v_booking := NEW.id; v_inquiry := NEW.inquiry_id;
    event_date := CASE WHEN NEW.date ~ '^\d{4}-\d{2}-\d{2}' THEN substr(NEW.date,1,10)::date END;
  END IF;

  FOR r IN SELECT * FROM public.task_automation_rules
           WHERE source = 'custom' AND enabled AND trigger_event = ev LOOP
    base_date := CASE WHEN r.offset_from = 'event' AND event_date IS NOT NULL THEN event_date ELSE (now() AT TIME ZONE 'Europe/Amsterdam')::date END;
    due := CASE WHEN r.offset_from = 'event' AND event_date IS NOT NULL THEN base_date - r.offset_days ELSE base_date + r.offset_days END;
    t_title := r.label || CASE WHEN coalesce(trim(NEW.contact_name),'') <> '' THEN ' - ' || trim(NEW.contact_name) ELSE '' END;

    IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE title = t_title
                   AND (booking_id IS NOT DISTINCT FROM v_booking)
                   AND (inquiry_id IS NOT DISTINCT FROM v_inquiry)) THEN
      INSERT INTO public.tasks (user_id, title, description, status, priority, due_date, assigned_to,
                                contact_id, company_id, inquiry_id, booking_id)
      VALUES (NEW.user_id, t_title, r.description, 'open', r.priority, to_char(due,'YYYY-MM-DD'),
              coalesce(r.assigned_to, NEW.assigned_to), NEW.contact_id, NEW.company_id, v_inquiry, v_booking);
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.run_custom_task_automations() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_custom_task_automations ON public.inquiries;
CREATE TRIGGER trg_custom_task_automations AFTER INSERT ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.run_custom_task_automations();
DROP TRIGGER IF EXISTS trg_custom_task_automations ON public.bookings;
CREATE TRIGGER trg_custom_task_automations AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.run_custom_task_automations();