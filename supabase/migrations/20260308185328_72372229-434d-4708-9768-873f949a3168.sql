
-- Sync queue for failed GHL operations with retry support
CREATE TABLE public.sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL, -- 'booking', 'contact', 'inquiry', 'task'
  entity_id uuid NOT NULL,
  action_type text NOT NULL, -- 'create', 'update', 'delete'
  payload jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'retrying', 'failed', 'completed'
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 5,
  last_error text,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Index for processing queue
CREATE INDEX idx_sync_queue_status ON public.sync_queue(status) WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_sync_queue_entity ON public.sync_queue(entity_type, entity_id);

-- Sync log for audit trail
CREATE TABLE public.sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL, -- 'push_booking', 'pull_booking', 'delete_booking', 'conflict_detected', 'sync_recovered', etc.
  details jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'success', -- 'success', 'error', 'conflict'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_log_entity ON public.sync_log(entity_type, entity_id);
CREATE INDEX idx_sync_log_created ON public.sync_log(created_at DESC);

-- Combined room conflict rules table
CREATE TABLE public.room_conflict_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_name text NOT NULL,
  conflicts_with text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_name, conflicts_with)
);

-- Insert combined room conflict rules
INSERT INTO public.room_conflict_rules (room_name, conflicts_with) VALUES
  ('Vergaderzaal 1.03+1.04', 'Vergaderzaal 1.03'),
  ('Vergaderzaal 1.03+1.04', 'Vergaderzaal 1.04'),
  ('Vergaderzaal 1.03', 'Vergaderzaal 1.03+1.04'),
  ('Vergaderzaal 1.04', 'Vergaderzaal 1.03+1.04');

-- RLS for sync_queue
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view sync_queue" ON public.sync_queue FOR SELECT TO authenticated
  USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert sync_queue" ON public.sync_queue FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update sync_queue" ON public.sync_queue FOR UPDATE TO authenticated
  USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete sync_queue" ON public.sync_queue FOR DELETE TO authenticated
  USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));

-- RLS for sync_log
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view sync_log" ON public.sync_log FOR SELECT TO authenticated
  USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can insert sync_log" ON public.sync_log FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));

-- RLS for room_conflict_rules (public read)
ALTER TABLE public.room_conflict_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read conflict rules" ON public.room_conflict_rules FOR SELECT TO authenticated
  USING (true);
