
-- Documents table for tracking proposals/documents sent from GHL
CREATE TABLE public.documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  inquiry_id uuid REFERENCES public.inquiries(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ghl_document_id text,
  title text NOT NULL DEFAULT 'Document',
  document_type text NOT NULL DEFAULT 'proposal',
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  viewed_at timestamp with time zone,
  signed_at timestamp with time zone,
  amount numeric,
  external_url text,
  contact_name text NOT NULL DEFAULT 'Onbekend',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(ghl_document_id)
);

-- RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view documents" ON public.documents
  FOR SELECT USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can create documents" ON public.documents
  FOR INSERT WITH CHECK (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can update documents" ON public.documents
  FOR UPDATE USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can delete documents" ON public.documents
  FOR DELETE USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));

-- Updated_at trigger
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
