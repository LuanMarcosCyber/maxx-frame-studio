CREATE OR REPLACE FUNCTION public.get_store_profile(_user_id uuid)
 RETURNS TABLE(id uuid, full_name text, store_name text, email text, phone text, document text, document_type text, cep text, address text, address_number text, city text, state text, avatar_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_target_parent uuid;
  v_store_id uuid := _user_id;
  v_authorized boolean := false;
  v_chain_node uuid;
BEGIN
  IF v_caller IS NULL OR _user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT p.parent_user_id INTO v_target_parent
  FROM public.profiles p
  WHERE p.id = _user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_store_id := COALESCE(v_target_parent, _user_id);

  IF v_caller = _user_id OR v_caller = v_store_id OR public.has_role(v_caller, 'admin') THEN
    v_authorized := true;
  ELSE
    v_chain_node := v_caller;
    FOR i IN 1..10 LOOP
      SELECT p.parent_user_id INTO v_chain_node FROM public.profiles p WHERE p.id = v_chain_node;
      IF v_chain_node IS NULL THEN EXIT; END IF;
      IF v_chain_node = _user_id OR v_chain_node = v_store_id THEN
        v_authorized := true;
        EXIT;
      END IF;
    END LOOP;

    IF NOT v_authorized THEN
      v_chain_node := _user_id;
      FOR i IN 1..10 LOOP
        SELECT p.parent_user_id INTO v_chain_node FROM public.profiles p WHERE p.id = v_chain_node;
        IF v_chain_node IS NULL THEN EXIT; END IF;
        IF v_chain_node = v_caller THEN
          v_authorized := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.store_name, p.email, p.phone,
         p.document, p.document_type, p.cep, p.address,
         p.address_number, p.city, p.state, p.avatar_url
  FROM public.profiles p
  WHERE p.id = v_store_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_store_profile(uuid) TO authenticated;