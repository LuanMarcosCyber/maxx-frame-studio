
CREATE OR REPLACE FUNCTION public.get_effective_profile()
RETURNS TABLE(
  id uuid,
  full_name text,
  store_name text,
  email text,
  phone text,
  document text,
  document_type text,
  cep text,
  address text,
  address_number text,
  city text,
  state text,
  avatar_url text,
  is_switched boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN;
  END IF;
  v_owner := public.owner_user_id(v_caller);
  IF v_owner IS NULL THEN
    v_owner := v_caller;
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.store_name, p.email, p.phone,
         p.document, p.document_type, p.cep, p.address,
         p.address_number, p.city, p.state, p.avatar_url,
         (v_owner <> v_caller) AS is_switched
  FROM public.profiles p
  WHERE p.id = v_owner;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_effective_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_effective_profile() TO authenticated, service_role;
