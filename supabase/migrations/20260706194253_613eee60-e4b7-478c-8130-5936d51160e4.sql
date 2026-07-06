
DO $$
DECLARE
  words text[] := ARRAY['van','de','den','der','des','ten','ter','te','het','op','in','aan','bij','onder','over','uit','voor','tot','''t','''s','la','le','du','da','do','dos','das','di','del','della','von','zu','af','al','el','y'];
  w text;
BEGIN
  FOREACH w IN ARRAY words LOOP
    -- Match the word as a whole token (surrounded by whitespace or string boundary), case-insensitive
    UPDATE public.contacts
      SET first_name = regexp_replace(first_name, '(^|\s)' || w || '(\s|$)', '\1' || w || '\2', 'gi')
      WHERE first_name ~* ('(^|\s)' || w || '(\s|$)');
    UPDATE public.contacts
      SET last_name = regexp_replace(last_name, '(^|\s)' || w || '(\s|$)', '\1' || w || '\2', 'gi')
      WHERE last_name ~* ('(^|\s)' || w || '(\s|$)');
    UPDATE public.companies
      SET name = regexp_replace(name, '(^|\s)' || w || '(\s|$)', '\1' || w || '\2', 'gi')
      WHERE name ~* ('(^|\s)' || w || '(\s|$)');
  END LOOP;
END $$;
