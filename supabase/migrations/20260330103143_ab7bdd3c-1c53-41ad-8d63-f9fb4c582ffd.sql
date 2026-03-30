ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS dmu text,
  ADD COLUMN IF NOT EXISTS function_group text,
  ADD COLUMN IF NOT EXISTS job_title text;