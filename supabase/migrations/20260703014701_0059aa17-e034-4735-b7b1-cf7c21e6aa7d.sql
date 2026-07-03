REVOKE EXECUTE ON FUNCTION public.get_store_profile(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.owner_user_id(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.next_document_number(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_collaborator(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.get_store_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_user_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_document_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_collaborator(uuid) TO authenticated;