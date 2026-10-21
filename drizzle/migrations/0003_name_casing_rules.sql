CREATE OR REPLACE FUNCTION public.normalize_person_name(input_text text, is_infix boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  words text[]; w text; part text; parts text[]; outp text[]; outw text[] := ARRAY[]::text[]; i int := 0;
  particles text[] := ARRAY['van','de','den','der','des','ten','ter','te','het','''t','''s','op','in','aan','bij','uit','voor','onder','over','tot','la','le','du','da','di','del','della','von','zu','dos','das'];
BEGIN
  IF input_text IS NULL OR btrim(input_text) = '' THEN RETURN input_text; END IF;
  words := regexp_split_to_array(btrim(input_text), '[[:space:]]+');
  IF is_infix THEN RETURN lower(array_to_string(words, ' ')); END IF;
  FOREACH w IN ARRAY words LOOP
    i := i + 1;
    IF i > 1 AND lower(w) = ANY(particles) THEN
      outw := array_append(outw, lower(w));
    ELSE
      outp := ARRAY[]::text[];
      FOREACH part IN ARRAY string_to_array(w, '-') LOOP
        IF lower(left(part, 2)) = 'ij' THEN part := 'IJ' || substr(part, 3);
        ELSIF part <> '' THEN part := upper(left(part, 1)) || substr(part, 2); END IF;
        outp := array_append(outp, part);
      END LOOP;
      outw := array_append(outw, array_to_string(outp, '-'));
    END IF;
  END LOOP;
  RETURN array_to_string(outw, ' ');
END $$;

CREATE OR REPLACE FUNCTION public.normalize_company_name(input_text text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE t text;
BEGIN
  IF input_text IS NULL OR btrim(input_text) = '' THEN RETURN input_text; END IF;
  t := btrim(input_text);
  IF lower(left(t, 2)) = 'ij' THEN RETURN 'IJ' || substr(t, 3); END IF;
  RETURN upper(left(t, 1)) || substr(t, 2);
END $$;

CREATE OR REPLACE FUNCTION public.normalize_name_particles_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_TABLE_NAME = 'contacts' THEN
    NEW.first_name := public.normalize_person_name(NEW.first_name);
    NEW.last_name := public.normalize_person_name(NEW.last_name);
    NEW.infix := public.normalize_person_name(NEW.infix, true);
    NEW.company := public.normalize_company_name(NEW.company);
  ELSIF TG_TABLE_NAME = 'companies' THEN
    NEW.name := public.normalize_company_name(NEW.name);
  ELSIF TG_TABLE_NAME IN ('inquiries','bookings','conversations','documents') THEN
    NEW.contact_name := public.normalize_person_name(NEW.contact_name);
  ELSIF TG_TABLE_NAME IN ('quotes','invoices') THEN
    NEW.contact_name := public.normalize_person_name(NEW.contact_name);
    NEW.company_name := public.normalize_company_name(NEW.company_name);
  END IF;
  RETURN NEW;
END $$;