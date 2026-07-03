
CREATE OR REPLACE FUNCTION public.get_store_profile(_user_id uuid)
RETURNS TABLE (
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
  avatar_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_current uuid := _user_id;
  v_parent uuid;
  v_visited uuid[] := ARRAY[]::uuid[];
  v_authorized boolean := false;
  v_chain_node uuid;
BEGIN
  IF v_caller IS NULL OR _user_id IS NULL THEN
    RETURN;
  END IF;

  -- Authorize: caller must be the target, an ancestor of the target,
  -- a descendant of the target, or an admin.
  IF v_caller = _user_id OR public.has_role(v_caller, 'admin') THEN
    v_authorized := true;
  ELSE
    -- Walk up from caller looking for the target as an ancestor.
    v_chain_node := v_caller;
    FOR i IN 1..10 LOOP
      SELECT parent_user_id INTO v_chain_node FROM public.profiles WHERE id = v_chain_node;
      IF v_chain_node IS NULL THEN EXIT; END IF;
      IF v_chain_node = _user_id THEN v_authorized := true; EXIT; END IF;
    END LOOP;

    -- Walk up from target looking for the caller as an ancestor.
    IF NOT v_authorized THEN
      v_chain_node := _user_id;
      FOR i IN 1..10 LOOP
        SELECT parent_user_id INTO v_chain_node FROM public.profiles WHERE id = v_chain_node;
        IF v_chain_node IS NULL THEN EXIT; END IF;
        IF v_chain_node = v_caller THEN v_authorized := true; EXIT; END IF;
      END LOOP;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN;
  END IF;

  -- Walk up from _user_id to the top-most ancestor (the store owner).
  FOR i IN 1..10 LOOP
    IF v_current = ANY(v_visited) THEN EXIT; END IF;
    v_visited := array_append(v_visited, v_current);
    SELECT parent_user_id INTO v_parent FROM public.profiles WHERE profiles.id = v_current;
    EXIT WHEN v_parent IS NULL;
    v_current := v_parent;
  END LOOP;

  RETURN QUERY
  SELECT p.id, p.full_name, p.store_name, p.email, p.phone,
         p.document, p.document_type, p.cep, p.address,
         p.address_number, p.city, p.state, p.avatar_url
  FROM public.profiles p
  WHERE p.id = v_current;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_store_profile(uuid) TO authenticated;
