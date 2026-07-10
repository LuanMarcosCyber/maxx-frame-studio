
-- 1) active_company_id column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_company_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2) audit table
CREATE TABLE IF NOT EXISTS public.company_switch_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  from_company_id uuid,
  to_company_id uuid,
  switched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.company_switch_audit TO authenticated;
GRANT ALL ON public.company_switch_audit TO service_role;
ALTER TABLE public.company_switch_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own audit" ON public.company_switch_audit;
CREATE POLICY "Users read own audit" ON public.company_switch_audit
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3) Helper: is target authorized for the current user?
CREATE OR REPLACE FUNCTION public.can_switch_to_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_row public.profiles%ROWTYPE;
  v_target_row public.profiles%ROWTYPE;
  v_user_group uuid;
  v_target_group uuid;
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_user_row FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND OR v_user_row.parent_user_id IS NOT NULL OR v_user_row.active IS NOT TRUE THEN
    -- Only "Empresa" accounts (no parent) can switch
    RETURN false;
  END IF;

  SELECT * INTO v_target_row FROM public.profiles WHERE id = _company_id;
  IF NOT FOUND OR v_target_row.parent_user_id IS NOT NULL OR v_target_row.active IS NOT TRUE THEN
    RETURN false;
  END IF;

  -- Own company is always allowed
  IF _company_id = _user_id THEN
    RETURN true;
  END IF;

  -- Must belong to the same company group
  v_user_group := COALESCE(v_user_row.company_group_id, v_user_row.id);
  v_target_group := COALESCE(v_target_row.company_group_id, v_target_row.id);
  RETURN v_user_group = v_target_group;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.can_switch_to_company(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_switch_to_company(uuid, uuid) TO authenticated, service_role;

-- 4) RPC: switch_active_company
CREATE OR REPLACE FUNCTION public.switch_active_company(_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  UPDATE public.profiles
     SET active_company_id = _company_id
   WHERE id = v_caller;

  INSERT INTO public.company_switch_audit (user_id, from_company_id, to_company_id)
  VALUES (v_caller, v_previous, _company_id);

  RETURN _company_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.switch_active_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_active_company(uuid) TO authenticated, service_role;

-- 5) RPC: clear_active_company (for logout)
CREATE OR REPLACE FUNCTION public.clear_active_company()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_previous uuid;
BEGIN
  IF v_caller IS NULL THEN RETURN; END IF;
  SELECT active_company_id INTO v_previous FROM public.profiles WHERE id = v_caller;
  IF v_previous IS NOT NULL THEN
    UPDATE public.profiles SET active_company_id = NULL WHERE id = v_caller;
    INSERT INTO public.company_switch_audit (user_id, from_company_id, to_company_id)
    VALUES (v_caller, v_previous, NULL);
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.clear_active_company() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_active_company() TO authenticated, service_role;

-- 6) RPC: list_switchable_companies
CREATE OR REPLACE FUNCTION public.list_switchable_companies()
RETURNS TABLE(id uuid, full_name text, store_name text, avatar_url text, is_active boolean, is_self boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_row public.profiles%ROWTYPE;
  v_group uuid;
  v_current uuid;
BEGIN
  IF v_caller IS NULL THEN RETURN; END IF;
  SELECT * INTO v_row FROM public.profiles WHERE id = v_caller;
  IF NOT FOUND OR v_row.parent_user_id IS NOT NULL THEN RETURN; END IF;

  v_group := COALESCE(v_row.company_group_id, v_row.id);
  v_current := COALESCE(v_row.active_company_id, v_row.id);

  RETURN QUERY
  SELECT p.id, p.full_name, p.store_name, p.avatar_url,
         (p.id = v_current) AS is_active,
         (p.id = v_caller)  AS is_self
    FROM public.profiles p
   WHERE p.parent_user_id IS NULL
     AND p.active = true
     AND (p.id = v_caller OR COALESCE(p.company_group_id, p.id) = v_group)
   ORDER BY (p.id = v_caller) DESC, p.store_name NULLS LAST, p.full_name;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.list_switchable_companies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_switchable_companies() TO authenticated, service_role;

-- 7) Update owner_user_id to respect authorized active_company_id
CREATE OR REPLACE FUNCTION public.owner_user_id(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.profiles%ROWTYPE;
  v_owner uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_row FROM public.profiles WHERE id = _user_id AND active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Base owner: parent for operational accounts, self for company accounts
  v_owner := COALESCE(v_row.parent_user_id, v_row.id);

  -- Only company accounts (no parent) may switch to another authorized company
  IF v_row.parent_user_id IS NULL
     AND v_row.active_company_id IS NOT NULL
     AND v_row.active_company_id <> v_row.id
     AND public.can_switch_to_company(v_row.id, v_row.active_company_id)
  THEN
    v_owner := v_row.active_company_id;
  END IF;

  RETURN v_owner;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.owner_user_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_user_id(uuid) TO authenticated, service_role;

-- 8) Strengthen anti-escalation trigger: block direct writes to active_company_id
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    -- service_role / no-jwt paths (migrations, admin) pass through
    RETURN NEW;
  END IF;

  -- active_company_id is ONLY writable via SECURITY DEFINER RPCs; never via direct UPDATE
  IF NEW.active_company_id IS DISTINCT FROM OLD.active_company_id THEN
    RAISE EXCEPTION 'active_company_id can only be changed via switch_active_company()';
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
$$;
