
-- Room settings table for per-user room capacity configuration
CREATE TABLE public.room_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  room_name TEXT NOT NULL,
  max_guests INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, room_name)
);

ALTER TABLE public.room_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own room_settings" ON public.room_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own room_settings" ON public.room_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own room_settings" ON public.room_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own room_settings" ON public.room_settings FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_room_settings_updated_at
BEFORE UPDATE ON public.room_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
