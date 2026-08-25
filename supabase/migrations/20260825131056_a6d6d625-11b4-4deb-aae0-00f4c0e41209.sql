-- 1. Remove initcap from the contacts trigger function (keep company auto-link)
CREATE OR REPLACE FUNCTION public.auto_link_company_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  matched_company_id uuid;
BEGIN
  IF NEW.company IS NOT NULL AND (NEW.company_id IS NULL OR TG_OP = 'INSERT' OR NEW.company IS DISTINCT FROM OLD.company) THEN
    SELECT id INTO matched_company_id
    FROM public.companies
    WHERE lower(trim(name)) = lower(trim(NEW.company))
    LIMIT 1;

    IF matched_company_id IS NOT NULL THEN
      NEW.company_id := matched_company_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Word-by-word normalization: lowercase Dutch particles, restore IJ, keep the rest as typed
CREATE OR REPLACE FUNCTION public.normalize_dutch_name_particles(input_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  parts text[];
  word text;
  out_parts text[] := ARRAY[]::text[];
  particles text[] := ARRAY[
    'van', 'de', 'den', 'der', 'des', 'ten', 'ter', 'te', 'het',
    'op', 'in', 'aan', 'bij', 'onder', 'over', 'uit', 'voor', 'tot', 'en',
    '''t', '''s', 'la', 'le', 'du', 'da', 'do', 'dos', 'das', 'di', 'del', 'della',
    'von', 'zu', 'af', 'al', 'el', 'y'
  ];
BEGIN
  IF input_text IS NULL OR btrim(input_text) = '' THEN
    RETURN input_text;
  END IF;

  parts := regexp_split_to_array(input_text, '([[:space:]]+)');
  -- regexp_split_to_array drops separators, so rebuild with single spaces only when needed
  parts := regexp_split_to_array(btrim(input_text), '[[:space:]]+');

  FOREACH word IN ARRAY parts LOOP
    IF lower(word) = ANY (particles) THEN
      word := lower(word);
    ELSIF word ~ '^Ij[a-zàáâäèéêëìíîïòóôöùúûüñç]' THEN
      -- Dutch IJ digraph: Ijsbrand -> IJsbrand
      word := 'IJ' || substr(word, 3);
    END IF;
    out_parts := array_append(out_parts, word);
  END LOOP;

  RETURN array_to_string(out_parts, ' ');
END;
$$;

-- 3. Run normalization on every contacts change, not only on name-column updates
DROP TRIGGER IF EXISTS normalize_contacts_name_particles ON public.contacts;
CREATE TRIGGER normalize_contacts_name_particles
BEFORE INSERT OR UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.normalize_name_particles_trigger();

-- 4. Sync every 5 minutes instead of every 30
SELECT cron.unschedule(4);
SELECT cron.schedule(
  'ghl-auto-sync-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://homqvnnphotphxemurwp.supabase.co/functions/v1/ghl-auto-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbXF2bm5waG90cGh4ZW11cndwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTQxNTcsImV4cCI6MjA4NzE5MDE1N30.i0jiWm-b1Tij3NUGCG5O3f8PoSWjT-jgml7kVBqrgjc"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  );
  $cron$
);