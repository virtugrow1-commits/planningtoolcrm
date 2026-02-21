
-- Add company_id column to contacts table with FK to companies
ALTER TABLE public.contacts
ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_contacts_company_id ON public.contacts(company_id);
