-- ============================================================================
-- CRM-automatiseringen (CliqCRM ↔ GoHighLevel)
--
-- 1. task_templates      – taken die de CRM zelf genereert (relatief aan de
--                          reserveringsdatum of het moment van de trigger)
-- 2. automation_settings – aan/uit + parameters per automatisering
-- 3. automation_runs     – idempotentie: elke automatisering vuurt per
--                          entiteit precies één keer (dedupe_key)
-- 4. bookings.option_expires_at / tasks.automation_key
-- 5. standaardsjablonen (UIT) en standaardinstellingen
-- 6. cron: crm-automations elke 10 minuten
-- ============================================================================

-- ---------------------------------------------------------------- 1. templates
CREATE TABLE IF NOT EXISTS public.task_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  trigger text NOT NULL CHECK (trigger IN (
    'booking_confirmed',   -- reservering definitief
    'booking_option',      -- optie geplaatst
    'booking_cancelled',   -- reservering geannuleerd
    'quote_sent',          -- offerte verzonden (GHL document)
    'quote_signed',        -- offerte/contract getekend (GHL document)
    'event_passed',        -- evenement heeft plaatsgevonden
    'option_expiring'      -- optie loopt binnenkort af
  )),
  title text NOT NULL,
  description text,
  -- 'event_date'  : offset t.o.v. de reserveringsdatum
  -- 'trigger_date': offset t.o.v. het moment waarop de trigger afgaat
  anchor text NOT NULL DEFAULT 'event_date' CHECK (anchor IN ('event_date', 'trigger_date')),
  offset_days integer NOT NULL DEFAULT 0,
  assignees text[] NOT NULL DEFAULT '{}'::text[],   -- display names; leeg = niet toegewezen
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_templates TO authenticated;
GRANT ALL ON public.task_templates TO service_role;
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members manage task templates" ON public.task_templates;
CREATE POLICY "Org members manage task templates"
  ON public.task_templates FOR ALL TO authenticated
  USING (user_id IN (SELECT p.id FROM public.profiles p WHERE p.organization_id = private.get_user_organization_id(auth.uid())))
  WITH CHECK (user_id IN (SELECT p.id FROM public.profiles p WHERE p.organization_id = private.get_user_organization_id(auth.uid())));

DROP TRIGGER IF EXISTS update_task_templates_updated_at ON public.task_templates;
CREATE TRIGGER update_task_templates_updated_at
  BEFORE UPDATE ON public.task_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------- 2. settings
CREATE TABLE IF NOT EXISTS public.automation_settings (
  key text NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_settings TO authenticated;
GRANT ALL ON public.automation_settings TO service_role;
ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members manage automation settings" ON public.automation_settings;
CREATE POLICY "Org members manage automation settings"
  ON public.automation_settings FOR ALL TO authenticated
  USING (user_id IN (SELECT p.id FROM public.profiles p WHERE p.organization_id = private.get_user_organization_id(auth.uid())))
  WITH CHECK (user_id IN (SELECT p.id FROM public.profiles p WHERE p.organization_id = private.get_user_organization_id(auth.uid())));

DROP TRIGGER IF EXISTS update_automation_settings_updated_at ON public.automation_settings;
CREATE TRIGGER update_automation_settings_updated_at
  BEFORE UPDATE ON public.automation_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------- 3. runs
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  automation text NOT NULL,            -- bijv. 'task_template', 'quote_sent', 'option_expiry', 'post_event'
  template_id uuid REFERENCES public.task_templates(id) ON DELETE SET NULL,
  entity_type text NOT NULL,           -- 'booking' | 'inquiry' | 'document' | 'conversation' | 'contact'
  entity_id uuid,
  dedupe_key text NOT NULL UNIQUE,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view automation runs" ON public.automation_runs;
CREATE POLICY "Org members can view automation runs"
  ON public.automation_runs FOR SELECT TO authenticated
  USING (user_id IN (SELECT p.id FROM public.profiles p WHERE p.organization_id = private.get_user_organization_id(auth.uid())));

CREATE INDEX IF NOT EXISTS automation_runs_entity_idx ON public.automation_runs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS automation_runs_created_idx ON public.automation_runs (created_at DESC);

-- ---------------------------------------------------------------- 4. kolommen
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS option_expires_at date;
COMMENT ON COLUMN public.bookings.option_expires_at IS 'Datum tot wanneer een optie geldig is; daarna kan de automatisering de optie laten vervallen.';

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS automation_key text;
-- Niet-partieel: PostgREST 'ON CONFLICT (automation_key)' heeft een volledige unieke index nodig (NULLs blijven toegestaan)
CREATE UNIQUE INDEX IF NOT EXISTS tasks_automation_key_uidx ON public.tasks (automation_key);
COMMENT ON COLUMN public.tasks.automation_key IS 'Gevuld voor taken die door een CRM-automatisering zijn aangemaakt (template:entiteit:assignee).';

-- ---------------------------------------------------------------- 5. seeds
-- Standaardsjablonen staan UIT: zet ze pas aan nadat de overeenkomstige
-- GHL-workflow is uitgeschakeld (anders krijg je de taken dubbel).
DO $seed$
DECLARE
  owner uuid;
BEGIN
  SELECT id INTO owner FROM public.profiles ORDER BY created_at LIMIT 1;
  IF owner IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.task_templates) THEN
    INSERT INTO public.task_templates (user_id, trigger, title, description, anchor, offset_days, assignees, priority, enabled, sort_order) VALUES
      (owner, 'booking_option',    'Optie nabellen',                          'Klant bellen: gaat de optie door? Zo ja, definitief maken; zo nee, optie vrijgeven.', 'trigger_date', 7,   ARRAY['Sjors Jochems','Iris Machielse'], 'normal', false, 10),
      (owner, 'booking_confirmed', 'Detailgesprek inplannen',                 'Draaiboek, opstelling, catering en tijden doornemen met de klant.',               'event_date',  -21, ARRAY['Sjors Jochems','Iris Machielse'], 'normal', false, 20),
      (owner, 'booking_confirmed', 'Def. aantal gasten + dieetwensen',        'Definitief aantal gasten en dieetwensen opvragen en vastleggen.',                 'event_date',  -7,  ARRAY['Sjors Jochems','Iris Machielse'], 'high',   false, 30),
      (owner, 'booking_confirmed', 'Draaiboek definitief maken',              'Draaiboek afronden en delen met het team.',                                        'event_date',  -3,  ARRAY['Sjors Jochems','Iris Machielse'], 'normal', false, 40),
      (owner, 'quote_sent',        'Offerte nabellen',                        'Offerte ontvangen? Vragen? Beslisdatum afspreken.',                                'trigger_date', 3,  ARRAY['Sjors Jochems','Iris Machielse'], 'normal', false, 50),
      (owner, 'event_passed',      'Factuur sturen',                          'Factuur opmaken en versturen.',                                                    'event_date',   1,  ARRAY['Sjors Jochems','Iris Machielse'], 'high',   false, 60),
      (owner, 'event_passed',      'After sales: hoe was het?',               'Klant bellen/mailen voor feedback en een review.',                                  'event_date',   7,  ARRAY['Sjors Jochems','Iris Machielse'], 'normal', false, 70),
      (owner, 'booking_cancelled', 'Annulering afhandelen',                   'Annuleringsvoorwaarden checken, eventuele kosten, bevestiging sturen.',            'trigger_date', 1,  ARRAY['Sjors Jochems','Iris Machielse'], 'normal', false, 80),
      (owner, 'option_expiring',   'Optie loopt af: klant bellen',            'Optie verloopt binnenkort. Beslissing vragen; anders vervalt de optie automatisch.','trigger_date', 0,  ARRAY['Sjors Jochems','Iris Machielse'], 'high',   false, 90);
  END IF;

  INSERT INTO public.automation_settings (key, user_id, enabled, config) VALUES
    ('task_templates',   owner, true,  '{}'::jsonb),
    ('quote_documents',  owner, false, '{"sent_status":"quoted","signed_status":"confirmed","convert_option_to_confirmed":true,"title_keywords":["offerte","contract"]}'::jsonb),
    ('option_expiry',    owner, false, '{"default_days_before_event":14,"warn_days_before_expiry":3,"auto_expire":true}'::jsonb),
    ('post_event',       owner, false, '{"inquiry_status":"invoiced","contact_status":"client","ghl_tags":["klant","review-aanvraag"],"lookback_days":14}'::jsonb),
    ('inbound_reply_sla',owner, false, '{"hours":4,"assignees":["Sjors Jochems","Iris Machielse"]}'::jsonb),
    ('contact_tags',     owner, false, '{"lead":"lead","prospect":"prospect","client":"klant","inactive":"inactief"}'::jsonb)
  ON CONFLICT (key) DO NOTHING;
END
$seed$;

-- ---------------------------------------------------------------- 6. cron
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-automations-10min') THEN
    PERFORM cron.unschedule('crm-automations-10min');
  END IF;
  PERFORM cron.schedule(
    'crm-automations-10min',
    '*/10 * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://homqvnnphotphxemurwp.supabase.co/functions/v1/crm-automations',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbXF2bm5waG90cGh4ZW11cndwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTQxNTcsImV4cCI6MjA4NzE5MDE1N30.i0jiWm-b1Tij3NUGCG5O3f8PoSWjT-jgml7kVBqrgjc"}'::jsonb,
      body := concat('{"source": "cron", "time": "', now(), '"}')::jsonb
    );
    $job$
  );
END
$cron$;
