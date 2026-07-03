REVOKE EXECUTE ON FUNCTION public.get_store_profile(uuid) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.get_store_profile(uuid) TO service_role;