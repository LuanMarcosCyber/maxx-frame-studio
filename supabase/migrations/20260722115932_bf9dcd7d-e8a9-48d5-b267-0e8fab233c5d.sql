
CREATE OR REPLACE FUNCTION public.preview_restore_default_catalog()
RETURNS TABLE(particular_products integer, commercial_configs integer, global_products integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_particular integer := 0;
  v_configs integer := 0;
  v_overrides integer := 0;
  v_global integer := 0;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_owner := public.owner_user_id(v_caller);
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT COUNT(*)::int INTO v_particular FROM public.products WHERE user_id = v_owner;
  SELECT COUNT(*)::int INTO v_configs FROM public.company_supplier_config WHERE owner_user_id = v_owner;
  SELECT COUNT(*)::int INTO v_overrides FROM public.company_product_overrides WHERE owner_user_id = v_owner;
  SELECT COUNT(*)::int INTO v_global
    FROM public.global_supplier_products gp
    JOIN public.suppliers s ON s.id = gp.supplier_id
    WHERE gp.active = true AND s.is_global = true AND s.publish_catalog = true;

  RETURN QUERY SELECT v_particular, v_configs + v_overrides, v_global;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_restore_default_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_restore_default_catalog() TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_default_catalog()
RETURNS TABLE(particular_products_deleted integer, commercial_configs_removed integer, global_products integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_is_admin boolean;
  v_is_revendedor boolean;
  v_is_colaborador boolean;
  v_can_create boolean;
  v_deleted_products integer := 0;
  v_deleted_configs integer := 0;
  v_deleted_overrides integer := 0;
  v_global integer := 0;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_is_admin := public.has_role(v_caller, 'admin');
  v_is_revendedor := public.has_role(v_caller, 'revendedor');
  SELECT (parent_user_id IS NOT NULL), COALESCE(can_create_products, false)
    INTO v_is_colaborador, v_can_create
    FROM public.profiles WHERE id = v_caller;

  IF NOT (v_is_admin OR v_is_revendedor OR (COALESCE(v_is_colaborador,false) AND v_can_create)) THEN
    RAISE EXCEPTION 'Sem permissão para restaurar o catálogo';
  END IF;

  v_owner := public.owner_user_id(v_caller);
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Empresa ativa não identificada'; END IF;

  WITH d AS (
    DELETE FROM public.products WHERE user_id = v_owner RETURNING 1
  ) SELECT COUNT(*)::int INTO v_deleted_products FROM d;

  WITH d AS (
    DELETE FROM public.company_supplier_config WHERE owner_user_id = v_owner RETURNING 1
  ) SELECT COUNT(*)::int INTO v_deleted_configs FROM d;

  WITH d AS (
    DELETE FROM public.company_product_overrides WHERE owner_user_id = v_owner RETURNING 1
  ) SELECT COUNT(*)::int INTO v_deleted_overrides FROM d;

  SELECT COUNT(*)::int INTO v_global
    FROM public.global_supplier_products gp
    JOIN public.suppliers s ON s.id = gp.supplier_id
    WHERE gp.active = true AND s.is_global = true AND s.publish_catalog = true;

  RETURN QUERY SELECT v_deleted_products, v_deleted_configs + v_deleted_overrides, v_global;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_default_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_default_catalog() TO authenticated;
