-- Reserveringsbevestiging naast de offerte
--
-- 1. Een aanvraag krijgt een vast reserveringsnummer, ook als er (nog) geen
--    reservering in de agenda staat. Het nummer komt uit dezelfde reeks als de
--    reserveringen (booking_number_seq), zodat offerte, bevestiging en agenda
--    hetzelfde RES-nummer tonen.
-- 2. Documenten worden ingedeeld als offerte / reserveringsbevestiging / overig,
--    zodat de offerte-automatisering een bevestiging niet meer als offerte ziet
--    en het dashboard ze los kan tellen.
-- 3. Het offertenummer (OFF-xxxxxx-rr) wordt bij verzenden op het document
--    vastgelegd, zodat de bevestiging het nummer van de getekende versie toont.

-- ------------------------------------------------------------------ aanvragen
ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS reservation_number text,
  ADD COLUMN IF NOT EXISTS reservering_gestaged_op timestamptz;

-- Geeft het reserveringsnummer van een aanvraag terug en kent er een toe als
-- het nog ontbreekt. Volgorde: bevestigde reservering, optie, eerder
-- toegekend nummer op de aanvraag, anders een nieuw nummer uit de reeks.
CREATE OR REPLACE FUNCTION public.ensure_inquiry_reservation_number(p_inquiry_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nr text;
BEGIN
  -- Rij vergrendelen: twee gelijktijdige klikken krijgen hetzelfde nummer
  SELECT reservation_number INTO v_nr
    FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aanvraag % niet gevonden', p_inquiry_id;
  END IF;

  IF v_nr IS NULL THEN
    SELECT b.reservation_number INTO v_nr
      FROM public.bookings b
     WHERE b.inquiry_id = p_inquiry_id
       AND b.status IN ('confirmed', 'option')
       AND b.reservation_number IS NOT NULL
     ORDER BY (b.status = 'confirmed') DESC, b.date ASC
     LIMIT 1;
  END IF;

  IF v_nr IS NULL THEN
    v_nr := 'RES-' || LPAD(nextval('public.booking_number_seq')::text, 6, '0');
  END IF;

  UPDATE public.inquiries SET reservation_number = v_nr
   WHERE id = p_inquiry_id AND reservation_number IS DISTINCT FROM v_nr;
  RETURN v_nr;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_inquiry_reservation_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_inquiry_reservation_number(uuid) TO authenticated, service_role;

-- Een nieuwe reservering bij een aanvraag die al een nummer heeft, krijgt dat
-- nummer (alleen de eerste; extra zalen krijgen een eigen nummer).
CREATE OR REPLACE FUNCTION public.assign_reservation_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_inq_nr text;
BEGIN
  IF NEW.reservation_number IS NULL AND NEW.inquiry_id IS NOT NULL THEN
    SELECT reservation_number INTO v_inq_nr FROM public.inquiries WHERE id = NEW.inquiry_id;
    IF v_inq_nr IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.bookings WHERE reservation_number = v_inq_nr
    ) THEN
      NEW.reservation_number := v_inq_nr;
    END IF;
  END IF;
  IF NEW.reservation_number IS NULL THEN
    NEW.reservation_number := 'RES-' || LPAD(nextval('public.booking_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------ documenten
-- Zelfde regels als documentKind() in supabase/functions/_shared/automations.ts
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS offerte_nummer text;

-- document_kind bestaat nog niet in de database; de DROP COLUMN IF EXISTS uit
-- het migratiebestand is hier een no-op en is weggelaten vanwege de pre-flight guard.
ALTER TABLE public.documents
  ADD COLUMN document_kind text GENERATED ALWAYS AS (
    CASE
      WHEN lower(title) ~ '(reserveringsbevestiging|reservering.*bevestig|bevestig.*reservering)' THEN 'reserveringsbevestiging'
      WHEN lower(title) ~ '(offerte|contract)' OR document_type IN ('proposal', 'estimate', 'contract') THEN 'offerte'
      ELSE 'overig'
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS documents_kind_status_idx ON public.documents (document_kind, status);
CREATE INDEX IF NOT EXISTS documents_inquiry_idx ON public.documents (inquiry_id);
CREATE INDEX IF NOT EXISTS bookings_reservation_number_idx ON public.bookings (reservation_number);