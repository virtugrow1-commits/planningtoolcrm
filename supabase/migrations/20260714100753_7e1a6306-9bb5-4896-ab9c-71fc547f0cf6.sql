
DROP TABLE IF EXISTS public.tmp_address_import;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION private.get_user_organization_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = _user_id
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_user_organization_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_user_organization_id(uuid) TO authenticated;

DO $rewrite$
DECLARE
  r record;
  new_qual text;
  new_check text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND ( qual LIKE '%has_role%' OR qual LIKE '%get_user_organization_id%'
         OR with_check LIKE '%has_role%' OR with_check LIKE '%get_user_organization_id%' )
  LOOP
    new_qual := regexp_replace(
                  regexp_replace(coalesce(r.qual, ''), '(^|[^\.a-zA-Z0-9_])has_role\(', '\1private.has_role(', 'g'),
                  '(^|[^\.a-zA-Z0-9_])get_user_organization_id\(', '\1private.get_user_organization_id(', 'g');
    new_check := regexp_replace(
                  regexp_replace(coalesce(r.with_check, ''), '(^|[^\.a-zA-Z0-9_])has_role\(', '\1private.has_role(', 'g'),
                  '(^|[^\.a-zA-Z0-9_])get_user_organization_id\(', '\1private.get_user_organization_id(', 'g');

    IF r.qual IS NOT NULL AND r.with_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)',
                     r.policyname, r.schemaname, r.tablename, new_qual, new_check);
    ELSIF r.qual IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',
                     r.policyname, r.schemaname, r.tablename, new_qual);
    ELSIF r.with_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
                     r.policyname, r.schemaname, r.tablename, new_check);
    END IF;
  END LOOP;
END
$rewrite$;

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.get_user_organization_id(uuid);

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

REVOKE ALL ON FUNCTION public.trigger_ghl_sync() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_ghl_sync() FROM anon;
REVOKE ALL ON FUNCTION public.trigger_ghl_sync() FROM authenticated;

DROP POLICY IF EXISTS "Public can view quotes by token" ON public.quotes;
DROP POLICY IF EXISTS "Public can update quotes by token" ON public.quotes;

CREATE OR REPLACE FUNCTION public.get_public_quote(_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  q record;
  items jsonb;
BEGIN
  IF _token IS NULL OR length(_token) < 8 THEN RETURN NULL; END IF;
  SELECT * INTO q FROM public.quotes WHERE public_token = _token;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(row_to_json(li) ORDER BY li.sort_order), '[]'::jsonb)
    INTO items
    FROM public.quote_line_items li
    WHERE li.quote_id = q.id;

  RETURN jsonb_build_object('quote', row_to_json(q), 'line_items', items);
END
$$;
REVOKE ALL ON FUNCTION public.get_public_quote(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_quote(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_quote_mark_viewed(_token text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.quotes
  SET viewed_at = now(), status = 'viewed'
  WHERE public_token = _token AND status = 'sent';
$$;
REVOKE ALL ON FUNCTION public.public_quote_mark_viewed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_quote_mark_viewed(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_quote_respond(
  _token text, _action text, _signature text, _ip text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _token IS NULL THEN RAISE EXCEPTION 'token required'; END IF;
  IF _action NOT IN ('accepted','declined') THEN RAISE EXCEPTION 'invalid action'; END IF;

  IF _action = 'accepted' THEN
    UPDATE public.quotes
    SET status = 'accepted',
        accepted_at = now(),
        signature_data = _signature,
        signature_ip = _ip
    WHERE public_token = _token
      AND status IN ('sent','viewed');
  ELSE
    UPDATE public.quotes
    SET status = 'declined', declined_at = now()
    WHERE public_token = _token
      AND status IN ('sent','viewed');
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.public_quote_respond(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_quote_respond(text, text, text, text) TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can read quote PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload quote PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete quote PDFs" ON storage.objects;

CREATE POLICY "Owners upload own quote PDFs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'quote-pdfs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Owners delete own quote PDFs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'quote-pdfs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Owners read own quote PDFs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'quote-pdfs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
