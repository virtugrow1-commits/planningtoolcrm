-- Revisienummer van de offerte per aanvraag ophogen (atomair). De functie
-- bestond al in de live database (aangemaakt vanuit Lovable) maar stond niet
-- in de migraties; hier idempotent vastgelegd zodat elke omgeving hem heeft.
CREATE OR REPLACE FUNCTION public.bump_offerte_revisie(p_inquiry_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rev integer;
BEGIN
  UPDATE public.inquiries
     SET offerte_revisie = COALESCE(offerte_revisie, 0) + 1
   WHERE id = p_inquiry_id
   RETURNING offerte_revisie INTO v_rev;
  IF v_rev IS NULL THEN
    RAISE EXCEPTION 'Aanvraag % niet gevonden', p_inquiry_id;
  END IF;
  RETURN v_rev;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_offerte_revisie(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_offerte_revisie(uuid) TO authenticated, service_role;
