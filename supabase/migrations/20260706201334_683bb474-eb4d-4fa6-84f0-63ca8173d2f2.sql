CREATE OR REPLACE FUNCTION public.normalize_dutch_name_particles(input_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  result text := input_text;
  particle text;
  particles text[] := ARRAY[
    'van', 'de', 'den', 'der', 'des', 'ten', 'ter', 'te', 'het',
    'op', 'in', 'aan', 'bij', 'onder', 'over', 'uit', 'voor', 'tot', 'en',
    '''t', '''s', 'la', 'le', 'du', 'da', 'do', 'dos', 'das', 'di', 'del', 'della',
    'von', 'zu', 'af', 'al', 'el', 'y'
  ];
BEGIN
  IF result IS NULL OR result = '' THEN
    RETURN result;
  END IF;

  FOREACH particle IN ARRAY particles LOOP
    result := regexp_replace(
      result,
      '(^|[[:space:]])' || particle || '([[:space:]]|$)',
      '\1' || particle || '\2',
      'gi'
    );
  END LOOP;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_name_particles_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_TABLE_NAME = 'contacts' THEN
    NEW.first_name := public.normalize_dutch_name_particles(NEW.first_name);
    NEW.last_name := public.normalize_dutch_name_particles(NEW.last_name);
    NEW.company := public.normalize_dutch_name_particles(NEW.company);
  ELSIF TG_TABLE_NAME = 'companies' THEN
    NEW.name := public.normalize_dutch_name_particles(NEW.name);
  ELSIF TG_TABLE_NAME = 'inquiries' THEN
    NEW.contact_name := public.normalize_dutch_name_particles(NEW.contact_name);
  ELSIF TG_TABLE_NAME = 'bookings' THEN
    NEW.contact_name := public.normalize_dutch_name_particles(NEW.contact_name);
  ELSIF TG_TABLE_NAME = 'conversations' THEN
    NEW.contact_name := public.normalize_dutch_name_particles(NEW.contact_name);
  ELSIF TG_TABLE_NAME = 'quotes' THEN
    NEW.contact_name := public.normalize_dutch_name_particles(NEW.contact_name);
    NEW.company_name := public.normalize_dutch_name_particles(NEW.company_name);
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    NEW.contact_name := public.normalize_dutch_name_particles(NEW.contact_name);
    NEW.company_name := public.normalize_dutch_name_particles(NEW.company_name);
  ELSIF TG_TABLE_NAME = 'documents' THEN
    NEW.contact_name := public.normalize_dutch_name_particles(NEW.contact_name);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_conversations_name_particles ON public.conversations;
CREATE TRIGGER normalize_conversations_name_particles
BEFORE INSERT OR UPDATE OF contact_name ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.normalize_name_particles_trigger();