CREATE TABLE public.contact_activity_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.contact_activities(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, contact_id)
);
CREATE INDEX idx_cap_contact ON public.contact_activity_participants(contact_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_activity_participants TO authenticated;
GRANT ALL ON public.contact_activity_participants TO service_role;
ALTER TABLE public.contact_activity_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage participants" ON public.contact_activity_participants
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.contact_activities a WHERE a.id = activity_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.contact_activities a WHERE a.id = activity_id));
INSERT INTO public.contact_activity_participants (activity_id, contact_id, user_id)
SELECT id, contact_id, user_id FROM public.contact_activities
WHERE type = 'call' AND contact_id IS NOT NULL
ON CONFLICT DO NOTHING;