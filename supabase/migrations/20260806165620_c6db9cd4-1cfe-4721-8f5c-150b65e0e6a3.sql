CREATE TABLE public.ghl_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ghl_tag_id text,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ghl_tags TO authenticated;
GRANT ALL ON public.ghl_tags TO service_role;

ALTER TABLE public.ghl_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view tags"
ON public.ghl_tags FOR SELECT TO authenticated USING (true);

CREATE UNIQUE INDEX ghl_tags_name_key ON public.ghl_tags (lower(name));

CREATE TRIGGER update_ghl_tags_updated_at
BEFORE UPDATE ON public.ghl_tags
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();