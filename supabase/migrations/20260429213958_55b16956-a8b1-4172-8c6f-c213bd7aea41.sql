ALTER TABLE public.contact_activities ADD COLUMN IF NOT EXISTS related_task_id uuid;
CREATE INDEX IF NOT EXISTS idx_contact_activities_related_task_id ON public.contact_activities(related_task_id);