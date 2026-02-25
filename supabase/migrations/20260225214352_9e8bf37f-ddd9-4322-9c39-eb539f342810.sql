
-- Junction table for many-to-many contact-company relationships
CREATE TABLE public.contact_companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  UNIQUE(contact_id, company_id)
);

-- Enable RLS
ALTER TABLE public.contact_companies ENABLE ROW LEVEL SECURITY;

-- RLS policies matching existing pattern
CREATE POLICY "Org members can view contact_companies"
  ON public.contact_companies FOR SELECT
  USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can create contact_companies"
  ON public.contact_companies FOR INSERT
  WITH CHECK (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update contact_companies"
  ON public.contact_companies FOR UPDATE
  USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete contact_companies"
  ON public.contact_companies FOR DELETE
  USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));

-- Seed from existing contacts.company_id (populate junction table with current relationships)
INSERT INTO public.contact_companies (contact_id, company_id, is_primary, user_id)
SELECT c.id, c.company_id, true, c.user_id
FROM public.contacts c
WHERE c.company_id IS NOT NULL
ON CONFLICT (contact_id, company_id) DO NOTHING;

-- Index for fast lookups
CREATE INDEX idx_contact_companies_contact ON public.contact_companies(contact_id);
CREATE INDEX idx_contact_companies_company ON public.contact_companies(company_id);
