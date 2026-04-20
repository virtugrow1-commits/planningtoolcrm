ALTER TABLE public.quotes
ADD COLUMN IF NOT EXISTS last_sent_to text,
ADD COLUMN IF NOT EXISTS last_sent_at timestamp with time zone;