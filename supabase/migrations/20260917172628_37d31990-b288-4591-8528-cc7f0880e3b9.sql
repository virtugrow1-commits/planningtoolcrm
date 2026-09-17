CREATE TABLE public.task_automation_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  match_key text NOT NULL,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, match_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_automation_rules TO authenticated;
GRANT ALL ON public.task_automation_rules TO service_role;

ALTER TABLE public.task_automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own task automation rules"
  ON public.task_automation_rules FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_task_automation_rules_updated_at
  BEFORE UPDATE ON public.task_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ghl_task_suppressions (
  ghl_task_id text NOT NULL PRIMARY KEY,
  reason text NOT NULL,
  kept_task_id uuid,
  match_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ghl_task_suppressions TO authenticated;
GRANT ALL ON public.ghl_task_suppressions TO service_role;

ALTER TABLE public.ghl_task_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read task suppressions"
  ON public.ghl_task_suppressions FOR SELECT TO authenticated
  USING (true);

CREATE INDEX idx_ghl_task_suppressions_reason ON public.ghl_task_suppressions (reason);