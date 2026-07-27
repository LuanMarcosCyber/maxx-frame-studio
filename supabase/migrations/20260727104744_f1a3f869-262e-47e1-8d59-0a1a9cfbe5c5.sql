-- 1. Expand get_effective_profile with commercial fields used by "Minha Conta".
DROP FUNCTION IF EXISTS public.get_effective_profile();
CREATE OR REPLACE FUNCTION public.get_effective_profile()
 RETURNS TABLE(
   id uuid, full_name text, store_name text, email text, phone text,
   document text, document_type text, cep text, address text,
   address_number text, city text, state text, avatar_url text,
   legal_name text, state_registration text, whatsapp text,
   complement text, neighborhood text,
   is_switched boolean
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         p.legal_name, p.state_registration, p.whatsapp,
         p.complement, p.neighborhood,
         (v_owner <> v_caller) AS is_switched
  FROM public.profiles p
  WHERE p.id = v_owner;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_effective_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_effective_profile() TO authenticated;

-- 2. Allow the company owner (login) to update commercial data of the effective
--    company from "Minha Conta". Only accounts without parent (real company
--    logins) can call it. Admin also allowed.
CREATE OR REPLACE FUNCTION public.update_active_company_commercial(_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_owner  uuid;
  v_is_admin boolean;
  v_is_child boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_admin := public.has_role(v_caller, 'admin');
  SELECT (parent_user_id IS NOT NULL) INTO v_is_child
    FROM public.profiles WHERE id = v_caller;

  IF v_is_child THEN
    RAISE EXCEPTION 'Somente o proprietário da empresa pode editar os dados comerciais.';
  END IF;

  v_owner := public.owner_user_id(v_caller);
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Empresa ativa não identificada.';
  END IF;

  UPDATE public.profiles SET
    full_name          = COALESCE(_data->>'full_name', full_name),
    store_name         = COALESCE(_data->>'store_name', store_name),
    legal_name         = COALESCE(_data->>'legal_name', legal_name),
    state_registration = COALESCE(_data->>'state_registration', state_registration),
    document           = COALESCE(_data->>'document', document),
    document_type      = COALESCE(_data->>'document_type', document_type),
    email              = COALESCE(_data->>'email', email),
    phone              = COALESCE(_data->>'phone', phone),
    whatsapp           = COALESCE(_data->>'whatsapp', whatsapp),
    cep                = COALESCE(_data->>'cep', cep),
    address            = COALESCE(_data->>'address', address),
    address_number     = COALESCE(_data->>'address_number', address_number),
    complement         = COALESCE(_data->>'complement', complement),
    neighborhood       = COALESCE(_data->>'neighborhood', neighborhood),
    city               = COALESCE(_data->>'city', city),
    state              = COALESCE(_data->>'state', state),
    updated_at         = now()
  WHERE id = v_owner;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_active_company_commercial(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_active_company_commercial(jsonb) TO authenticated;

-- 3. Harden the existing admin helper: require admin explicitly. It was
--    already only invoked from admin server functions, but this closes the
--    gap in case it is ever called directly.
CREATE OR REPLACE FUNCTION public.update_company_commercial(_company_id uuid, _data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Somente o Administrador Global pode editar dados de outras empresas.';
  END IF;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'company_id required'; END IF;
  UPDATE public.profiles SET
    full_name          = COALESCE(_data->>'full_name', full_name),
    store_name         = COALESCE(_data->>'store_name', store_name),
    legal_name         = COALESCE(_data->>'legal_name', legal_name),
    state_registration = COALESCE(_data->>'state_registration', state_registration),
    document           = COALESCE(_data->>'document', document),
    document_type      = COALESCE(_data->>'document_type', document_type),
    email              = COALESCE(_data->>'email', email),
    phone              = COALESCE(_data->>'phone', phone),
    whatsapp           = COALESCE(_data->>'whatsapp', whatsapp),
    cep                = COALESCE(_data->>'cep', cep),
    address            = COALESCE(_data->>'address', address),
    address_number     = COALESCE(_data->>'address_number', address_number),
    complement         = COALESCE(_data->>'complement', complement),
    neighborhood       = COALESCE(_data->>'neighborhood', neighborhood),
    city               = COALESCE(_data->>'city', city),
    state              = COALESCE(_data->>'state', state),
    updated_at         = now()
  WHERE id = _company_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_company_commercial(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_company_commercial(uuid, jsonb) TO authenticated;
