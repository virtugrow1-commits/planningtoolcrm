ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS legacy_task_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_user_legacy_task_id_unique
  ON public.tasks (user_id, legacy_task_id)
  WHERE legacy_task_id IS NOT NULL;