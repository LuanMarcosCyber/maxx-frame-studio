
DROP FUNCTION IF EXISTS public.list_visible_products();

CREATE OR REPLACE FUNCTION public.list_visible_products()
 RETURNS TABLE(id uuid, source text, code text, description text, category text,
   supplier text, supplier_id uuid, base_price numeric, effective_price numeric,
   width_cm numeric, ncm text, profit_margin numeric, waste_percentage numeric,
   commission_percentage numeric, labor_cost numeric, has_override boolean,
   config_pending boolean, name text, barcode text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_owner uuid;
BEGIN
  v_owner := public.owner_user_id(auth.uid());
  IF v_owner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id, 'company'::text, p.code, p.description, p.category,
    COALESCE(NULLIF(btrim(s.trade_name), ''), s.legal_name, p.supplier),
    p.supplier_id, p.value_per_meter, p.value_per_meter,
    p.frame_width_cm, p.ncm, p.profit_margin, p.waste_percentage,
    p.commission_percentage, p.labor_cost, false, false, p.name, p.barcode
  FROM public.products p
  LEFT JOIN public.suppliers s ON s.id = p.supplier_id
  WHERE p.user_id = v_owner;

  RETURN QUERY
  SELECT gp.id, 'global'::text, gp.code, gp.description, gp.category,
    COALESCE(NULLIF(btrim(s.trade_name), ''), s.legal_name), gp.supplier_id,
    gp.base_price, COALESCE(o.base_price_override, gp.base_price),
    gp.width_cm, gp.ncm,
    COALESCE(o.profit_margin, c.margin),
    COALESCE(o.waste_percentage, c.loss),
    COALESCE(o.commission_percentage, c.commission),
    COALESCE(o.labor_cost, c.labor_cost),
    (o.id IS NOT NULL),
    (o.id IS NULL AND c.supplier_id IS NULL),
    NULL::text, NULL::text
  FROM public.global_supplier_products gp
  JOIN public.suppliers s ON s.id = gp.supplier_id
    AND s.is_global = true AND s.publish_catalog = true
  LEFT JOIN public.company_product_overrides o
    ON o.global_product_id = gp.id AND o.owner_user_id = v_owner
  LEFT JOIN public.company_supplier_config c
    ON c.owner_user_id = v_owner AND c.supplier_id = gp.supplier_id
  WHERE gp.active = true;
END; $function$;

CREATE OR REPLACE FUNCTION public.upsert_company_product_override(
  _global_product_id uuid,
  _margin numeric,
  _loss numeric,
  _commission numeric,
  _labor_cost numeric,
  _base_price_override numeric
) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_owner uuid; v_id uuid; v_exists boolean;
BEGIN
  v_owner := public.owner_user_id(auth.uid());
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _global_product_id IS NULL THEN RAISE EXCEPTION 'global_product_id required'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.global_supplier_products WHERE id = _global_product_id AND active = true) INTO v_exists;
  IF NOT v_exists THEN RAISE EXCEPTION 'Produto global não encontrado'; END IF;

  IF _margin IS NOT NULL AND _margin < 0 THEN RAISE EXCEPTION 'Margem inválida'; END IF;
  IF _loss IS NOT NULL AND _loss < 0 THEN RAISE EXCEPTION 'Perda inválida'; END IF;
  IF _commission IS NOT NULL AND _commission < 0 THEN RAISE EXCEPTION 'Comissão inválida'; END IF;
  IF _labor_cost IS NOT NULL AND _labor_cost < 0 THEN RAISE EXCEPTION 'Mão de obra inválida'; END IF;
  IF _base_price_override IS NOT NULL AND _base_price_override < 0 THEN RAISE EXCEPTION 'Preço inválido'; END IF;

  INSERT INTO public.company_product_overrides
    (owner_user_id, global_product_id, profit_margin, waste_percentage,
     commission_percentage, labor_cost, base_price_override)
  VALUES (v_owner, _global_product_id, _margin, _loss, _commission, _labor_cost, _base_price_override)
  ON CONFLICT (owner_user_id, global_product_id) DO UPDATE
    SET profit_margin = EXCLUDED.profit_margin,
        waste_percentage = EXCLUDED.waste_percentage,
        commission_percentage = EXCLUDED.commission_percentage,
        labor_cost = EXCLUDED.labor_cost,
        base_price_override = EXCLUDED.base_price_override,
        updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.reset_company_product_override(_global_product_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_owner uuid; v_count integer;
BEGIN
  v_owner := public.owner_user_id(auth.uid());
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.company_product_overrides
   WHERE owner_user_id = v_owner AND global_product_id = _global_product_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END; $function$;

CREATE OR REPLACE FUNCTION public.preview_price_increase(_category text, _supplier_id uuid, _percentage numeric)
 RETURNS TABLE(total integer, sample jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid(); v_owner uuid; v_scope uuid[];
  v_is_admin boolean; v_supplier_global boolean; v_can boolean := false;
  v_total integer := 0; v_sample jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _percentage IS NULL OR _percentage <= 0 THEN RAISE EXCEPTION 'Percentual inválido'; END IF;
  IF _category IS NULL OR _category = '' THEN RAISE EXCEPTION 'Categoria obrigatória'; END IF;
  IF _supplier_id IS NULL THEN RAISE EXCEPTION 'Fornecedor obrigatório'; END IF;

  v_is_admin := public.has_role(v_caller, 'admin');
  v_can := v_is_admin OR public.has_role(v_caller, 'revendedor')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_caller
      AND p.parent_user_id IS NOT NULL AND COALESCE(p.can_create_products, false));
  IF NOT v_can THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  SELECT is_global INTO v_supplier_global FROM public.suppliers WHERE id = _supplier_id;
  IF v_supplier_global IS NULL THEN RAISE EXCEPTION 'Fornecedor não encontrado'; END IF;

  v_owner := public.owner_user_id(v_caller);

  IF v_supplier_global AND v_is_admin THEN
    SELECT COUNT(*)::int INTO v_total FROM public.global_supplier_products
      WHERE category = _category AND supplier_id = _supplier_id AND active = true;
    SELECT jsonb_agg(row_to_json(t)) INTO v_sample FROM (
      SELECT code, description, base_price AS current_price,
        round(base_price * (1 + _percentage/100.0), 2) AS new_price
        FROM public.global_supplier_products
       WHERE category = _category AND supplier_id = _supplier_id AND active = true
       ORDER BY code LIMIT 8) t;
  ELSIF v_supplier_global AND NOT v_is_admin THEN
    SELECT COUNT(*)::int INTO v_total FROM public.global_supplier_products
      WHERE category = _category AND supplier_id = _supplier_id AND active = true;
    SELECT jsonb_agg(row_to_json(t)) INTO v_sample FROM (
      SELECT gp.code, gp.description,
        COALESCE(o.base_price_override, gp.base_price) AS current_price,
        round(COALESCE(o.base_price_override, gp.base_price) * (1 + _percentage/100.0), 2) AS new_price
        FROM public.global_supplier_products gp
        LEFT JOIN public.company_product_overrides o
          ON o.global_product_id = gp.id AND o.owner_user_id = v_owner
       WHERE gp.category = _category AND gp.supplier_id = _supplier_id AND gp.active = true
       ORDER BY gp.code LIMIT 8) t;
  ELSE
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_scope
      FROM public.company_group_owner_ids(v_owner) AS t(id);
    SELECT COUNT(*)::int INTO v_total FROM public.products
      WHERE category = _category AND supplier_id = _supplier_id AND user_id = ANY(v_scope);
    SELECT jsonb_agg(row_to_json(t)) INTO v_sample FROM (
      SELECT code, description, value_per_meter AS current_price,
        round(value_per_meter * (1 + _percentage/100.0), 2) AS new_price
        FROM public.products
       WHERE category = _category AND supplier_id = _supplier_id AND user_id = ANY(v_scope)
       ORDER BY code LIMIT 8) t;
  END IF;

  RETURN QUERY SELECT v_total, COALESCE(v_sample, '[]'::jsonb);
END; $function$;

CREATE OR REPLACE FUNCTION public.apply_price_increase(_category text, _supplier_id uuid, _percentage numeric)
 RETURNS TABLE(products_affected integer, history_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid(); v_owner uuid; v_scope uuid[];
  v_is_admin boolean; v_supplier_global boolean; v_can boolean := false;
  v_updated integer := 0; v_history uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _percentage IS NULL OR _percentage <= 0 THEN RAISE EXCEPTION 'Percentual inválido'; END IF;
  IF _category IS NULL OR _category = '' THEN RAISE EXCEPTION 'Categoria obrigatória'; END IF;
  IF _supplier_id IS NULL THEN RAISE EXCEPTION 'Fornecedor obrigatório'; END IF;

  v_is_admin := public.has_role(v_caller, 'admin');
  v_can := v_is_admin OR public.has_role(v_caller, 'revendedor')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_caller
      AND p.parent_user_id IS NOT NULL AND COALESCE(p.can_create_products, false));
  IF NOT v_can THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  SELECT is_global INTO v_supplier_global FROM public.suppliers WHERE id = _supplier_id;
  IF v_supplier_global IS NULL THEN RAISE EXCEPTION 'Fornecedor não encontrado'; END IF;

  v_owner := public.owner_user_id(v_caller);

  IF v_supplier_global AND v_is_admin THEN
    WITH upd AS (
      UPDATE public.global_supplier_products
         SET base_price = round(base_price * (1 + _percentage/100.0), 2), updated_at = now()
       WHERE category = _category AND supplier_id = _supplier_id AND active = true
       RETURNING id)
    SELECT COUNT(*)::int INTO v_updated FROM upd;
  ELSIF v_supplier_global AND NOT v_is_admin THEN
    WITH ins AS (
      INSERT INTO public.company_product_overrides
        (owner_user_id, global_product_id, base_price_override)
      SELECT v_owner, gp.id,
             round(COALESCE(o.base_price_override, gp.base_price) * (1 + _percentage/100.0), 2)
        FROM public.global_supplier_products gp
        LEFT JOIN public.company_product_overrides o
          ON o.global_product_id = gp.id AND o.owner_user_id = v_owner
       WHERE gp.category = _category AND gp.supplier_id = _supplier_id AND gp.active = true
      ON CONFLICT (owner_user_id, global_product_id) DO UPDATE
        SET base_price_override = EXCLUDED.base_price_override, updated_at = now()
      RETURNING id)
    SELECT COUNT(*)::int INTO v_updated FROM ins;
  ELSE
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_scope
      FROM public.company_group_owner_ids(v_owner) AS t(id);
    WITH upd AS (
      UPDATE public.products
         SET value_per_meter = round(value_per_meter * (1 + _percentage/100.0), 2), updated_at = now()
       WHERE category = _category AND supplier_id = _supplier_id AND user_id = ANY(v_scope)
       RETURNING id)
    SELECT COUNT(*)::int INTO v_updated FROM upd;
  END IF;

  INSERT INTO public.price_increase_history
    (user_id, owner_user_id, supplier_id, supplier_is_global, category, percentage, products_affected)
  VALUES
    (v_caller, COALESCE(v_owner, v_caller), _supplier_id, v_supplier_global, _category, _percentage, v_updated)
  RETURNING id INTO v_history;

  RETURN QUERY SELECT v_updated, v_history;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.upsert_company_product_override(uuid, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_company_product_override(uuid, numeric, numeric, numeric, numeric, numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_company_product_override(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_company_product_override(uuid) TO authenticated;
