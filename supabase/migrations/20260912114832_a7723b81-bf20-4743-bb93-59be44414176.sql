CREATE INDEX IF NOT EXISTS tasks_status_due_date_idx ON public.tasks (status, due_date);
CREATE INDEX IF NOT EXISTS tasks_assigned_to_status_idx ON public.tasks (assigned_to, status);
CREATE INDEX IF NOT EXISTS tasks_completed_at_idx ON public.tasks (completed_at);
CREATE INDEX IF NOT EXISTS tasks_created_at_idx ON public.tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_inquiry_id_idx ON public.tasks (inquiry_id);
CREATE INDEX IF NOT EXISTS tasks_contact_id_idx ON public.tasks (contact_id);
CREATE INDEX IF NOT EXISTS tasks_company_id_idx ON public.tasks (company_id);
CREATE INDEX IF NOT EXISTS tasks_booking_id_idx ON public.tasks (booking_id);