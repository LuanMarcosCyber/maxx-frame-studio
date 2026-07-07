-- Revoke EXECUTE from public/anon on SECURITY DEFINER functions in public schema
-- These functions should not be directly callable by anonymous users.
-- They remain usable by authenticated users, service_role, and internally by RLS.

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owner_user_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_collaborator(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_store_profile(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.company_group_owner_ids(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_document_number(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_user_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_collaborator(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_store_profile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.company_group_owner_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_document_number(text) TO authenticated, service_role;