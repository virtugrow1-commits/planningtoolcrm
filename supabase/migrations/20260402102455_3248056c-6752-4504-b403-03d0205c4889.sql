
-- Storage bucket for quote PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('quote-pdfs', 'quote-pdfs', true);

-- Allow authenticated users to upload to quote-pdfs
CREATE POLICY "Authenticated users can upload quote PDFs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quote-pdfs');

-- Allow authenticated users to read quote PDFs
CREATE POLICY "Anyone can read quote PDFs"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'quote-pdfs');

-- Allow authenticated users to delete their quote PDFs
CREATE POLICY "Authenticated users can delete quote PDFs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'quote-pdfs');

-- Add PDF columns to quotes table
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS overlay_fields jsonb DEFAULT '[]'::jsonb;
