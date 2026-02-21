ALTER TABLE public.inquiries DROP CONSTRAINT inquiries_status_check;

ALTER TABLE public.inquiries ADD CONSTRAINT inquiries_status_check CHECK (status = ANY (ARRAY['new', 'contacted', 'option', 'quoted', 'quote_revised', 'reserved', 'confirmed', 'invoiced', 'converted', 'lost', 'after_sales']));
