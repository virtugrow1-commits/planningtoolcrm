-- ============================================================================
-- Secure trigger for the 10-minute CRM-automations run
--
-- The cron job authenticated with the public anon JWT and the function compared
-- it to SUPABASE_ANON_KEY. On Lovable Cloud that env value is not the same key,
-- so every scheduled run was rejected (401) and the time-based automations
-- (option expiry, post-event, quote documents, reply SLA) never ran.
--
-- Fix without weakening auth: a random secret that only the database knows,
-- stored in Supabase Vault. The cron job sends it in the x-cron-secret header;
-- the edge function checks it through verify_crm_cron_secret(), which only the
-- service role may execute. Nothing has to be configured by hand.
-- Idempotent.
-- ============================================================================

DO $ext$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'supabase_vault') THEN
    CREATE EXTENSION IF NOT EXISTS supabase_vault;
  END IF;
END
$ext$;

-- 1. secret (created once, never overwritten)
DO $sec$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'crm_automations_cron_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'crm_automations_cron_secret',
      'Shared secret between the crm-automations cron job and the edge function'
    );
  END IF;
END
$sec$;

-- 2. check function (service role only)
CREATE OR REPLACE FUNCTION public.verify_crm_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT coalesce(length(p_secret), 0) >= 32 AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'crm_automations_cron_secret' AND decrypted_secret = p_secret
  );
$$;
REVOKE EXECUTE ON FUNCTION public.verify_crm_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_crm_cron_secret(text) TO service_role;

-- 3. reschedule the job; the secret is read from Vault at run time, so it never
--    appears in this file or in cron.job
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
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbXF2bm5waG90cGh4ZW11cndwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTQxNTcsImV4cCI6MjA4NzE5MDE1N30.i0jiWm-b1Tij3NUGCG5O3f8PoSWjT-jgml7kVBqrgjc',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_automations_cron_secret')
      ),
      body := jsonb_build_object('source', 'cron', 'time', now())
    );
    $job$
  );
END
$cron$;
