-- Reserveringen kunnen in de UI de status 'cancelled' (geannuleerd) en 'expired'
-- (vervallen optie) krijgen. De oorspronkelijke CHECK-constraint stond alleen
-- 'confirmed' en 'option' toe, waardoor annuleren mislukte met een constraint-fout.
-- Idempotent: veilig om opnieuw uit te voeren.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('confirmed', 'option', 'cancelled', 'expired'));

-- Snellere lookups vanuit de GHL-taaksynchronisatie
CREATE INDEX IF NOT EXISTS tasks_ghl_task_id_idx ON public.tasks (ghl_task_id) WHERE ghl_task_id IS NOT NULL;