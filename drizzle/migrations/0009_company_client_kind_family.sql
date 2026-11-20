ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS client_kind text NOT NULL DEFAULT 'bedrijf';
UPDATE public.companies SET client_kind = 'particulier' WHERE is_private = true;
ALTER TABLE public.companies ADD CONSTRAINT companies_client_kind_check CHECK (client_kind IN ('bedrijf','particulier','familie'));
ALTER TABLE public.contact_companies ADD COLUMN IF NOT EXISTS family_role text;