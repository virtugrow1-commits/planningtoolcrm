-- ============================================================================
-- Secure trigger for the 10-minute CRM-automations run
--
-- The cron job authenticated with the public anon JWT and the function compared
-- it to SUPABASE_ANON_KEY. On Lovable Cloud that env value is not the same key,
-- so every scheduled run was rejected (401) and the time-based automations
-- (option expiry, post-event, quote documents, reply SLA) never ran.
--
-- Fix without weakening auth: a random secret that only the database knows.
-- (Supabase Vault is not accessible on Lovable Cloud, so it lives in a schema
-- that is not exposed through the API and is closed to anon/authenticated.)
-- The cron job sends it in the x-cron-secret header; the edge function checks it
-- through verify_crm_cron_secret(), which only the service role may execute.
-- Nothing has to be configured by hand. Idempotent.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.app_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.app_secrets FROM PUBLIC, anon, authenticated;

-- 1. secret (created once, never overwritten); 64 hex chars from two random UUIDs
INSERT INTO private.app_secrets (name, value)
VALUES ('crm_automations_cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
ON CONFLICT (name) DO NOTHING;

-- 2. check function (service role only)
CREATE OR REPLACE FUNCTION public.verify_crm_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT coalesce(length(p_secret), 0) >= 32 AND EXISTS (
    SELECT 1 FROM private.app_secrets
    WHERE name = 'crm_automations_cron_secret' AND value = p_secret
  );
$$;
REVOKE EXECUTE ON FUNCTION public.verify_crm_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_crm_cron_secret(text) TO service_role;

-- 3. reschedule the job; the secret is read at run time, so it never appears in
--    this file or in cron.job
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
        'x-cron-secret', (SELECT value FROM private.app_secrets WHERE name = 'crm_automations_cron_secret')
      ),
      body := jsonb_build_object('source', 'cron', 'time', now())
    );
    $job$
  );
END
$cron$;
