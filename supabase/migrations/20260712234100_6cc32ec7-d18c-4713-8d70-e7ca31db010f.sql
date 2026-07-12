CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.active_company_id IS DISTINCT FROM OLD.active_company_id THEN
    IF current_setting('app.allow_active_company_change', true) <> 'on' THEN
      RAISE EXCEPTION 'active_company_id can only be changed via switch_active_company()';
    END IF;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF OLD.parent_user_id IS NOT NULL AND OLD.parent_user_id = auth.uid() THEN
    IF NEW.company_group_id IS DISTINCT FROM OLD.company_group_id THEN
      RAISE EXCEPTION 'Not authorized to modify company group link';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.parent_user_id IS DISTINCT FROM OLD.parent_user_id
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.can_edit_budgets IS DISTINCT FROM OLD.can_edit_budgets
     OR NEW.can_create_products IS DISTINCT FROM OLD.can_create_products
     OR NEW.can_create_clients IS DISTINCT FROM OLD.can_create_clients
     OR NEW.can_delete_orders IS DISTINCT FROM OLD.can_delete_orders
     OR NEW.max_discount_percent IS DISTINCT FROM OLD.max_discount_percent
     OR NEW.company_group_id IS DISTINCT FROM OLD.company_group_id
  THEN
    RAISE EXCEPTION 'Not authorized to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.switch_active_company(_company_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_previous uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'company_id required';
  END IF;
  IF NOT public.can_switch_to_company(v_caller, _company_id) THEN
    RAISE EXCEPTION 'Not authorized to switch to this company';
  END IF;

  SELECT active_company_id INTO v_previous FROM public.profiles WHERE id = v_caller;

  PERFORM set_config('app.allow_active_company_change', 'on', true);
  UPDATE public.profiles
     SET active_company_id = _company_id
   WHERE id = v_caller;
  PERFORM set_config('app.allow_active_company_change', 'off', true);

  INSERT INTO public.company_switch_audit (user_id, from_company_id, to_company_id)
  VALUES (v_caller, v_previous, _company_id);

  RETURN _company_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.clear_active_company()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_previous uuid;
BEGIN
  IF v_caller IS NULL THEN RETURN; END IF;
  SELECT active_company_id INTO v_previous FROM public.profiles WHERE id = v_caller;
  IF v_previous IS NOT NULL THEN
    PERFORM set_config('app.allow_active_company_change', 'on', true);
    UPDATE public.profiles SET active_company_id = NULL WHERE id = v_caller;
    PERFORM set_config('app.allow_active_company_change', 'off', true);
    INSERT INTO public.company_switch_audit (user_id, from_company_id, to_company_id)
    VALUES (v_caller, v_previous, NULL);
  END IF;
END;
$function$;