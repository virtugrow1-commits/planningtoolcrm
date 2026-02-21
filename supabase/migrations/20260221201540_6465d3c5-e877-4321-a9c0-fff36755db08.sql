
-- Create contact activities table for conversation/interaction logging
CREATE TABLE public.contact_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'note',
  subject TEXT,
  body TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activities" ON public.contact_activities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own activities" ON public.contact_activities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own activities" ON public.contact_activities FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own activities" ON public.contact_activities FOR DELETE USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_contact_activities_contact_id ON public.contact_activities(contact_id);
CREATE INDEX idx_contact_activities_created_at ON public.contact_activities(created_at DESC);

-- Updated_at trigger
CREATE TRIGGER update_contact_activities_updated_at
  BEFORE UPDATE ON public.contact_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
