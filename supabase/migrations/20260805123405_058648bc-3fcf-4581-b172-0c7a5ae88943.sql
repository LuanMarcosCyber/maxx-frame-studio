CREATE OR REPLACE FUNCTION public.create_company_owner_operator(_company_id uuid, _owner_name text, _pin_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF _company_id IS NULL OR _owner_name IS NULL OR _pin_hash IS NULL THEN
    RAISE EXCEPTION 'Parâmetros obrigatórios ausentes';
  END IF;

  INSERT INTO public.operators (
    owner_user_id, name, nickname, pin_hash, active,
    is_owner, can_delete_orders, max_discount_percent, is_global_admin,
    can_access_reports, can_access_history, can_manage_registrations,
    reg_clients, reg_products, reg_suppliers, reg_architects, reg_carriers
  ) VALUES (
    _company_id, upper(_owner_name), 'Proprietário', _pin_hash, true,
    true, true, 100, false,
    true, true, true,
    true, true, true, true, true
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
$function$;

REVOKE EXECUTE ON FUNCTION public.create_company_owner_operator(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company_owner_operator(uuid, text, text) TO service_role;