
-- 1) Block creation of legacy "Contas de acesso" (parent_user_id linked profiles)
CREATE OR REPLACE FUNCTION public.block_new_operational_profile()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.parent_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Contas de acesso foram descontinuadas. Crie um usuário interno vinculado à empresa.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_new_operational_profile ON public.profiles;
CREATE TRIGGER trg_block_new_operational_profile
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.block_new_operational_profile();

-- 2) Owner-user helper: called by the server fn AFTER creating auth.users +
-- the base profile row. Creates the internal owner operator with full
-- permissions, hashed PIN provided by the server (scrypt string).
CREATE OR REPLACE FUNCTION public.create_company_owner_operator(
  _company_id uuid,
  _owner_name text,
  _pin_hash text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF _company_id IS NULL OR _owner_name IS NULL OR _pin_hash IS NULL THEN
    RAISE EXCEPTION 'Parâmetros obrigatórios ausentes';
  END IF;

  INSERT INTO public.operators (
    owner_user_id, name, nickname, pin_hash, active,
    can_edit_budgets, can_create_products, can_create_clients,
    can_delete_orders, max_discount_percent, is_global_admin
  ) VALUES (
    _company_id, upper(_owner_name), 'Proprietário', _pin_hash, true,
    true, true, true, true, 100, false
  )
  RETURNING id INTO v_id;

  INSERT INTO public.activity_logs (
    company_id, internal_user_id, action, entity, entity_id, metadata
  ) VALUES (
    _company_id, v_id, 'company.created', 'company', _company_id,
    jsonb_build_object('owner_name', upper(_owner_name))
  );

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_company_owner_operator(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_company_owner_operator(uuid, text, text) TO service_role;

-- 3) Update commercial data on a company profile (called by the wizard step 2).
-- Runs as SECURITY DEFINER but only the admin server fn calls it — restricted to service_role.
CREATE OR REPLACE FUNCTION public.update_company_commercial(
  _company_id uuid,
  _data jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _company_id IS NULL THEN RAISE EXCEPTION 'company_id required'; END IF;
  UPDATE public.profiles SET
    document      = COALESCE(_data->>'document', document),
    document_type = COALESCE(_data->>'document_type', document_type),
    email         = COALESCE(_data->>'email', email),
    phone         = COALESCE(_data->>'phone', phone),
    cep           = COALESCE(_data->>'cep', cep),
    address       = COALESCE(_data->>'address', address),
    address_number= COALESCE(_data->>'address_number', address_number),
    city          = COALESCE(_data->>'city', city),
    state         = COALESCE(_data->>'state', state),
    updated_at    = now()
  WHERE id = _company_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_company_commercial(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_company_commercial(uuid, jsonb) TO service_role;
