
-- Sequences for display numbers
CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1;

-- Quote Templates
CREATE TABLE public.quote_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  content_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_line_items jsonb DEFAULT '[]'::jsonb,
  terms_and_conditions text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quote_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view quote_templates" ON public.quote_templates FOR SELECT USING (
  user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid()))
);
CREATE POLICY "Org members can create quote_templates" ON public.quote_templates FOR INSERT WITH CHECK (
  user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid()))
);
CREATE POLICY "Org members can update quote_templates" ON public.quote_templates FOR UPDATE USING (
  user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid()))
);
CREATE POLICY "Org members can delete quote_templates" ON public.quote_templates FOR DELETE USING (
  user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid()))
);

-- Quotes
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  display_number text,
  contact_id uuid REFERENCES public.contacts(id),
  company_id uuid REFERENCES public.companies(id),
  template_id uuid REFERENCES public.quote_templates(id),
  contact_name text NOT NULL DEFAULT 'Onbekend',
  company_name text,
  client_email text,
  client_address text,
  title text NOT NULL DEFAULT 'Offerte',
  introduction text,
  terms_and_conditions text,
  notes text,
  subtotal numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  valid_until date,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  signature_data text,
  signature_ip text,
  signed_pdf_url text,
  public_token text UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  ghl_opportunity_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view quotes" ON public.quotes FOR SELECT USING (
  user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid()))
);
CREATE POLICY "Org members can create quotes" ON public.quotes FOR INSERT WITH CHECK (
  user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid()))
);
CREATE POLICY "Org members can update quotes" ON public.quotes FOR UPDATE USING (
  user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid()))
);
CREATE POLICY "Org members can delete quotes" ON public.quotes FOR DELETE USING (
  user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid()))
);

-- Quote Line Items
CREATE TABLE public.quote_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  item_name text NOT NULL,
  description text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 21,
  discount_percent numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quote_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view quote_line_items" ON public.quote_line_items FOR SELECT USING (
  quote_id IN (SELECT q.id FROM quotes q WHERE q.user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())))
);
CREATE POLICY "Org members can create quote_line_items" ON public.quote_line_items FOR INSERT WITH CHECK (
  quote_id IN (SELECT q.id FROM quotes q WHERE q.user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())))
);
CREATE POLICY "Org members can update quote_line_items" ON public.quote_line_items FOR UPDATE USING (
  quote_id IN (SELECT q.id FROM quotes q WHERE q.user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())))
);
CREATE POLICY "Org members can delete quote_line_items" ON public.quote_line_items FOR DELETE USING (
  quote_id IN (SELECT q.id FROM quotes q WHERE q.user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())))
);

-- Invoices
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  display_number text,
  quote_id uuid REFERENCES public.quotes(id),
  contact_id uuid REFERENCES public.contacts(id),
  company_id uuid REFERENCES public.companies(id),
  contact_name text NOT NULL DEFAULT 'Onbekend',
  company_name text,
  client_email text,
  client_address text,
  title text NOT NULL DEFAULT 'Factuur',
  subtotal numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  due_date date,
  sent_at timestamptz,
  paid_at timestamptz,
  payment_method text,
  stripe_payment_link text,
  stripe_invoice_id text,
  ghl_invoice_id text,
  eboekhouden_mutation_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view invoices" ON public.invoices FOR SELECT USING (
  user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid()))
);
CREATE POLICY "Org members can create invoices" ON public.invoices FOR INSERT WITH CHECK (
  user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid()))
);
CREATE POLICY "Org members can update invoices" ON public.invoices FOR UPDATE USING (
  user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid()))
);
CREATE POLICY "Org members can delete invoices" ON public.invoices FOR DELETE USING (
  user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid()))
);

-- Invoice Line Items
CREATE TABLE public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  item_name text NOT NULL,
  description text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 21,
  discount_percent numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  ledger_account text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view invoice_line_items" ON public.invoice_line_items FOR SELECT USING (
  invoice_id IN (SELECT i.id FROM invoices i WHERE i.user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())))
);
CREATE POLICY "Org members can create invoice_line_items" ON public.invoice_line_items FOR INSERT WITH CHECK (
  invoice_id IN (SELECT i.id FROM invoices i WHERE i.user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())))
);
CREATE POLICY "Org members can update invoice_line_items" ON public.invoice_line_items FOR UPDATE USING (
  invoice_id IN (SELECT i.id FROM invoices i WHERE i.user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())))
);
CREATE POLICY "Org members can delete invoice_line_items" ON public.invoice_line_items FOR DELETE USING (
  invoice_id IN (SELECT i.id FROM invoices i WHERE i.user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())))
);

-- Auto-assign display numbers
CREATE OR REPLACE FUNCTION public.assign_quote_number()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.display_number IS NULL THEN
    NEW.display_number := 'OFF-' || LPAD(nextval('public.quote_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_quote_number BEFORE INSERT ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.assign_quote_number();

CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.display_number IS NULL THEN
    NEW.display_number := 'FAC-' || LPAD(nextval('public.invoice_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_invoice_number BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_number();

-- Updated_at triggers
CREATE TRIGGER trg_quotes_updated_at BEFORE UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_quote_templates_updated_at BEFORE UPDATE ON public.quote_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public access policy for quote viewing via public_token (no auth needed)
CREATE POLICY "Public can view quotes by token" ON public.quotes FOR SELECT TO anon
USING (public_token IS NOT NULL);
