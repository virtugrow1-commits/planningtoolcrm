-- ============================================================================
-- Eén systeem voor automatische taken
--
-- Migratie 20260929083721 (Lovable) voegde "eigen taakregels" toe als
-- database-trigger op inquiries/bookings. Die trigger schrijft een tekstwaarde
-- in tasks.due_date (type date) en laat daardoor ELKE nieuwe aanvraag of
-- reservering mislukken zodra er een eigen regel aan staat. Daarnaast deed hij
-- hetzelfde als de CRM-automatiseringen (task_templates), wat dubbele taken
-- zou geven.
--
-- Deze migratie:
--   1. verwijdert de trigger en de functie,
--   2. voegt de trigger 'inquiry_created' toe aan task_templates,
--   3. zet bestaande eigen regels om naar task_templates (zelfde aan/uit-stand),
--   4. zet de oude regels uit zodat ze nergens meer meetellen.
-- Idempotent.
-- ============================================================================

-- 1. trigger + functie weg
DROP TRIGGER IF EXISTS trg_custom_task_automations ON public.inquiries;
DROP TRIGGER IF EXISTS trg_custom_task_automations ON public.bookings;
DROP FUNCTION IF EXISTS public.run_custom_task_automations();

-- 2. 'inquiry_created' als trigger toestaan
DO $chk$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.task_templates'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%trigger%'
  LOOP
    EXECUTE format('ALTER TABLE public.task_templates DROP CONSTRAINT %I', c.conname);
  END LOOP;
END
$chk$;

ALTER TABLE public.task_templates
  ADD CONSTRAINT task_templates_trigger_check CHECK (trigger IN (
    'inquiry_created', 'booking_confirmed', 'booking_option', 'booking_cancelled',
    'quote_sent', 'quote_signed', 'event_passed', 'option_expiring'
  ));

ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS legacy_rule_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS task_templates_legacy_rule_uidx ON public.task_templates (legacy_rule_id);

-- 3. eigen regels omzetten (alleen als de kolommen van 20260929083721 bestaan)
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'task_automation_rules' AND column_name = 'source'
  ) THEN
    INSERT INTO public.task_templates
      (user_id, trigger, title, description, anchor, offset_days, assignees, priority, enabled, sort_order, legacy_rule_id)
    SELECT
      r.user_id,
      CASE r.trigger_event
        WHEN 'inquiry_created' THEN 'inquiry_created'
        WHEN 'option_created'  THEN 'booking_option'
        ELSE 'booking_confirmed'
      END,
      r.label,
      r.description,
      CASE WHEN r.offset_from = 'event' THEN 'event_date' ELSE 'trigger_date' END,
      -- oude regel: 'event' = N dagen vóór de datum, 'created' = N dagen na aanmaken
      CASE WHEN r.offset_from = 'event' THEN -abs(r.offset_days) ELSE abs(r.offset_days) END,
      CASE WHEN r.assigned_to IS NULL OR r.assigned_to IN ('', 'auto') THEN '{}'::text[] ELSE ARRAY[r.assigned_to] END,
      CASE WHEN r.priority IN ('low', 'normal', 'high', 'urgent') THEN r.priority ELSE 'normal' END,
      r.enabled,
      1000,
      r.id
    FROM public.task_automation_rules r
    WHERE r.source = 'custom'
      AND NOT EXISTS (SELECT 1 FROM public.task_templates t WHERE t.legacy_rule_id = r.id);

    UPDATE public.task_automation_rules SET enabled = false WHERE source = 'custom' AND enabled;
  END IF;
END
$mig$;