ALTER TABLE public.contact_activities ADD COLUMN IF NOT EXISTS ghl_note_id text;
CREATE INDEX IF NOT EXISTS idx_contact_activities_ghl_note_id ON public.contact_activities(ghl_note_id);