
-- 1) Extend history table
ALTER TABLE public.price_increase_history
  ADD COLUMN IF NOT EXISTS field text NOT NULL DEFAULT 'cost',
  ADD COLUMN IF NOT EXISTS new_value numeric;

ALTER TABLE public.price_increase_history
  ALTER COLUMN percentage DROP NOT NULL,
  ALTER COLUMN direction DROP NOT NULL;

-- 2) Preview function for margin/loss/commission/labor
CREATE OR REPLACE FUNCTION public.preview_bulk_config_change(
  _field text, _category text, _supplier_id uuid, _new_value numeric
)
RETURNS TABLE(total integer, sample jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_scope uuid[];
  v_supplier_global boolean;
  v_col text;
  v_cfg_col text;
  v_total integer := 0;
  v_sample jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _category IS NULL OR _category = '' THEN RAISE EXCEPTION 'Categoria obrigatória'; END IF;
  IF _supplier_id IS NULL THEN RAISE EXCEPTION 'Fornecedor obrigatório'; END IF;
  IF _new_value IS NULL OR _new_value < 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  CASE _field
    WHEN 'margin'     THEN v_col := 'profit_margin';        v_cfg_col := 'margin';
    WHEN 'loss'       THEN v_col := 'waste_percentage';     v_cfg_col := 'loss';
    WHEN 'commission' THEN v_col := 'commission_percentage';v_cfg_col := 'commission';
    WHEN 'labor'      THEN v_col := 'labor_cost';           v_cfg_col := 'labor_cost';
    ELSE RAISE EXCEPTION 'Campo inválido';
  END CASE;

  IF _field IN ('loss','commission') AND _new_value > 100 THEN
    RAISE EXCEPTION 'Valor deve estar entre 0 e 100';
  END IF;

  SELECT is_global INTO v_supplier_global FROM public.suppliers WHERE id = _supplier_id;
  IF v_supplier_global IS NULL THEN RAISE EXCEPTION 'Fornecedor não encontrado'; END IF;

  v_owner := public.owner_user_id(v_caller);

  IF v_supplier_global THEN
    SELECT COUNT(*)::int INTO v_total
      FROM public.global_supplier_products
      WHERE category = _category AND supplier_id = _supplier_id AND active = true;

    EXECUTE format($sql$
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT gp.code, gp.description,
          COALESCE(o.%1$I, c.%2$I) AS current_value,
          $1::numeric AS new_value
        FROM public.global_supplier_products gp
        LEFT JOIN public.company_product_overrides o
          ON o.global_product_id = gp.id AND o.owner_user_id = $2
        LEFT JOIN public.company_supplier_config c
          ON c.owner_user_id = $2 AND c.supplier_id = gp.supplier_id
        WHERE gp.category = $3 AND gp.supplier_id = $4 AND gp.active = true
        ORDER BY gp.code LIMIT 8
      ) t
    $sql$, v_col, v_cfg_col) INTO v_sample USING _new_value, v_owner, _category, _supplier_id;
  ELSE
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_scope
      FROM public.company_group_owner_ids(v_owner) AS t(id);
    SELECT COUNT(*)::int INTO v_total
      FROM public.products
      WHERE category = _category AND supplier_id = _supplier_id AND user_id = ANY(v_scope);
    EXECUTE format($sql$
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT code, description, %1$I AS current_value, $1::numeric AS new_value
          FROM public.products
         WHERE category = $2 AND supplier_id = $3 AND user_id = ANY($4)
         ORDER BY code LIMIT 8
      ) t
    $sql$, v_col) INTO v_sample USING _new_value, _category, _supplier_id, v_scope;
  END IF;

  RETURN QUERY SELECT v_total, COALESCE(v_sample, '[]'::jsonb);
END; $function$;

REVOKE ALL ON FUNCTION public.preview_bulk_config_change(text, text, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_bulk_config_change(text, text, uuid, numeric) TO authenticated;

-- 3) Apply function
CREATE OR REPLACE FUNCTION public.apply_bulk_config_change(
  _field text, _category text, _supplier_id uuid, _new_value numeric
)
RETURNS TABLE(products_affected integer, history_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_scope uuid[];
  v_is_admin boolean;
  v_supplier_global boolean;
  v_can boolean := false;
  v_updated integer := 0;
  v_history uuid;
  v_col text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _category IS NULL OR _category = '' THEN RAISE EXCEPTION 'Categoria obrigatória'; END IF;
  IF _supplier_id IS NULL THEN RAISE EXCEPTION 'Fornecedor obrigatório'; END IF;
  IF _new_value IS NULL OR _new_value < 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  CASE _field
    WHEN 'margin'     THEN v_col := 'profit_margin';
    WHEN 'loss'       THEN v_col := 'waste_percentage';
    WHEN 'commission' THEN v_col := 'commission_percentage';
    WHEN 'labor'      THEN v_col := 'labor_cost';
    ELSE RAISE EXCEPTION 'Campo inválido';
  END CASE;

  IF _field IN ('loss','commission') AND _new_value > 100 THEN
    RAISE EXCEPTION 'Valor deve estar entre 0 e 100';
  END IF;

  v_is_admin := public.has_role(v_caller, 'admin');
  v_can := v_is_admin OR public.has_role(v_caller, 'revendedor')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_caller
      AND p.parent_user_id IS NOT NULL AND COALESCE(p.can_create_products, false));
  IF NOT v_can THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  SELECT is_global INTO v_supplier_global FROM public.suppliers WHERE id = _supplier_id;
  IF v_supplier_global IS NULL THEN RAISE EXCEPTION 'Fornecedor não encontrado'; END IF;

  v_owner := public.owner_user_id(v_caller);

  IF v_supplier_global THEN
    EXECUTE format($sql$
      WITH ins AS (
        INSERT INTO public.company_product_overrides
          (owner_user_id, global_product_id, %1$I)
        SELECT $1, gp.id, $2
          FROM public.global_supplier_products gp
         WHERE gp.category = $3 AND gp.supplier_id = $4 AND gp.active = true
        ON CONFLICT (owner_user_id, global_product_id) DO UPDATE
          SET %1$I = EXCLUDED.%1$I, updated_at = now()
        RETURNING id
      ) SELECT COUNT(*)::int FROM ins
    $sql$, v_col) INTO v_updated USING v_owner, _new_value, _category, _supplier_id;
  ELSE
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_scope
      FROM public.company_group_owner_ids(v_owner) AS t(id);
    EXECUTE format($sql$
      WITH upd AS (
        UPDATE public.products
           SET %1$I = $1, updated_at = now()
         WHERE category = $2 AND supplier_id = $3 AND user_id = ANY($4)
         RETURNING id
      ) SELECT COUNT(*)::int FROM upd
    $sql$, v_col) INTO v_updated USING _new_value, _category, _supplier_id, v_scope;
  END IF;

  INSERT INTO public.price_increase_history
    (user_id, owner_user_id, supplier_id, supplier_is_global, category,
     percentage, products_affected, direction, field, new_value)
  VALUES
    (v_caller, COALESCE(v_owner, v_caller), _supplier_id, v_supplier_global, _category,
     NULL, v_updated, NULL, _field, _new_value)
  RETURNING id INTO v_history;

  RETURN QUERY SELECT v_updated, v_history;
END; $function$;

REVOKE ALL ON FUNCTION public.apply_bulk_config_change(text, text, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_bulk_config_change(text, text, uuid, numeric) TO authenticated;
