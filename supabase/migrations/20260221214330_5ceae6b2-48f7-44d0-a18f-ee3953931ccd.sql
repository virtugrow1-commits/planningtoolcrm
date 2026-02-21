
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS kvk text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS postcode text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS country text DEFAULT 'NL';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS customer_number text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS crm_group text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS btw_number text;
