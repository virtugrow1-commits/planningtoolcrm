
-- Add GHL opportunity ID to inquiries for sync tracking
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS ghl_opportunity_id TEXT;
CREATE INDEX IF NOT EXISTS idx_inquiries_ghl_opportunity_id ON public.inquiries (ghl_opportunity_id);
