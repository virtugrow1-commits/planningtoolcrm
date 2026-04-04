-- Add content_blocks to quotes table (stores resolved template blocks)
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS content_blocks jsonb DEFAULT '[]'::jsonb;

-- Add e-boekhouden credentials to a settings table (per user/org)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own settings" ON public.app_settings
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Public RPC: create invoice from accepted quote (no auth needed for public signing page)
CREATE OR REPLACE FUNCTION public.create_invoice_from_accepted_quote(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote record;
  v_invoice_id uuid;
  v_display_number text;
BEGIN
  -- Get quote
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id AND status = 'accepted';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Quote not found or not accepted');
  END IF;

  -- Check if invoice already exists for this quote
  IF EXISTS (SELECT 1 FROM invoices WHERE quote_id = p_quote_id) THEN
    RETURN jsonb_build_object('error', 'Invoice already exists for this quote');
  END IF;

  -- Generate invoice number
  v_display_number := 'F-' || LPAD(nextval('invoice_number_seq')::text, 4, '0');

  -- Create invoice
  INSERT INTO invoices (
    user_id, quote_id, contact_id, company_id,
    contact_name, company_name, client_email, client_address,
    title, subtotal, vat_amount, discount_amount, total,
    status, due_date, display_number
  )
  VALUES (
    v_quote.user_id, p_quote_id, v_quote.contact_id, v_quote.company_id,
    v_quote.contact_name, v_quote.company_name, v_quote.client_email, v_quote.client_address,
    'Factuur - ' || v_quote.title,
    v_quote.subtotal, v_quote.vat_amount, v_quote.discount_amount, v_quote.total,
    'draft',
    (CURRENT_DATE + INTERVAL '30 days')::date,
    v_display_number
  )
  RETURNING id INTO v_invoice_id;

  -- Copy line items
  INSERT INTO invoice_line_items (invoice_id, sort_order, item_name, description, quantity, unit_price, vat_rate, discount_percent, line_total)
  SELECT v_invoice_id, sort_order, item_name, description, quantity, unit_price, vat_rate, discount_percent, line_total
  FROM quote_line_items
  WHERE quote_id = p_quote_id;

  RETURN jsonb_build_object('invoice_id', v_invoice_id, 'display_number', v_display_number);
END;
$$;

-- Allow public (anon) access to this function for the signing page
GRANT EXECUTE ON FUNCTION public.create_invoice_from_accepted_quote(uuid) TO anon, authenticated;
