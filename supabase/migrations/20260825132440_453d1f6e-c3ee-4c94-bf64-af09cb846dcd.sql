ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS local_status_changed_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.track_inquiry_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Only stamp when the caller did not set it explicitly in this statement
    IF NEW.local_status_changed_at IS NOT DISTINCT FROM OLD.local_status_changed_at THEN
      NEW.local_status_changed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_inquiry_status_change ON public.inquiries;
CREATE TRIGGER trg_track_inquiry_status_change
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.track_inquiry_status_change();

UPDATE public.inquiries
SET local_status_changed_at = updated_at
WHERE local_status_changed_at IS NULL
  AND status <> 'new';