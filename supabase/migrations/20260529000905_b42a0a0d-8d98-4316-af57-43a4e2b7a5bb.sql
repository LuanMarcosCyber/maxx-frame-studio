
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
-- has_role still needs to be callable by authenticated (RLS uses it via SECURITY DEFINER context, but explicit grant)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
