ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

ALTER TABLE public.contact_activities ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contact_activities_company_id ON public.contact_activities(company_id);

ALTER TABLE public.contact_companies ADD COLUMN IF NOT EXISTS departed_at timestamptz;

UPDATE public.contact_activities a
SET company_id = c.company_id
FROM public.contacts c
WHERE a.contact_id = c.id AND a.company_id IS NULL AND c.company_id IS NOT NULL;

UPDATE public.inquiries i
SET company_id = c.company_id
FROM public.contacts c
WHERE i.contact_id = c.id AND i.company_id IS NULL AND c.company_id IS NOT NULL;

UPDATE public.bookings b
SET company_id = c.company_id
FROM public.contacts c
WHERE b.contact_id = c.id AND b.company_id IS NULL AND c.company_id IS NOT NULL;