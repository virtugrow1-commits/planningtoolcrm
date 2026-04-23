
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS pending_outbound_sync boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_local_edit_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_error text;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS pending_outbound_sync boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_local_edit_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_error text;

CREATE INDEX IF NOT EXISTS idx_contacts_pending_sync
  ON public.contacts (pending_outbound_sync)
  WHERE pending_outbound_sync = true;

CREATE INDEX IF NOT EXISTS idx_companies_pending_sync
  ON public.companies (pending_outbound_sync)
  WHERE pending_outbound_sync = true;
