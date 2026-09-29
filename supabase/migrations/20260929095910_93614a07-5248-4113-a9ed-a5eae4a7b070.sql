REVOKE EXECUTE ON FUNCTION public.bump_offerte_revisie(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bump_offerte_revisie(uuid) TO authenticated, service_role;
ALTER FUNCTION public.bump_offerte_revisie(uuid) SET search_path = '';