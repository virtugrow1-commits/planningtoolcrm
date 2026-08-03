ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS local_status_changed_at timestamp with time zone;

COMMENT ON COLUMN public.tasks.local_status_changed_at IS 'Timestamp of the last explicit task status change made in the CRM; used to prevent stale external sync from reopening completed tasks.';