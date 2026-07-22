
-- Add direction column to history
ALTER TABLE public.price_increase_history
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'increase'
  CHECK (direction IN ('increase','decrease'));

-- Replace preview function with direction support
CREATE OR REPLACE FUNCTION public.preview_price_increase(
  _category text,
  _supplier_id uuid,
  _percentage numeric,
  _direction text DEFAULT 'increase'
)
 RETURNS TABLE(total integer, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid(); v_owner uuid; v_scope uuid[];
  v_is_admin boolean; v_supplier_global boolean; v_can boolean := false;
  v_total integer := 0; v_sample jsonb;
  v_factor numeric;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _percentage IS NULL OR _percentage <= 0 THEN RAISE EXCEPTION 'Percentual inválido'; END IF;
  IF _direction NOT IN ('increase','decrease') THEN RAISE EXCEPTION 'Tipo de alteração inválido'; END IF;
  IF _direction = 'decrease' AND _percentage >= 100 THEN RAISE EXCEPTION 'Redução deve ser inferior a 100%%'; END IF;
  IF _category IS NULL OR _category = '' THEN RAISE EXCEPTION 'Categoria obrigatória'; END IF;
  IF _supplier_id IS NULL THEN RAISE EXCEPTION 'Fornecedor obrigatório'; END IF;

  v_factor := CASE WHEN _direction = 'decrease' THEN (1 - _percentage/100.0) ELSE (1 + _percentage/100.0) END;

  v_is_admin := public.has_role(v_caller, 'admin');
  v_can := v_is_admin OR public.has_role(v_caller, 'revendedor')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_caller
      AND p.parent_user_id IS NOT NULL AND COALESCE(p.can_create_products, false));
  IF NOT v_can THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  SELECT is_global INTO v_supplier_global FROM public.suppliers WHERE id = _supplier_id;
  IF v_supplier_global IS NULL THEN RAISE EXCEPTION 'Fornecedor não encontrado'; END IF;

  v_owner := public.owner_user_id(v_caller);

  IF v_supplier_global THEN
    -- Global supplier: preview always via overrides scoped to active company
    SELECT COUNT(*)::int INTO v_total FROM public.global_supplier_products
      WHERE category = _category AND supplier_id = _supplier_id AND active = true;
    SELECT jsonb_agg(row_to_json(t)) INTO v_sample FROM (
      SELECT gp.code, gp.description,
        COALESCE(o.base_price_override, gp.base_price) AS current_price,
        round(COALESCE(o.base_price_override, gp.base_price) * v_factor, 2) AS new_price
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
        round(value_per_meter * v_factor, 2) AS new_price
        FROM public.products
       WHERE category = _category AND supplier_id = _supplier_id AND user_id = ANY(v_scope)
       ORDER BY code LIMIT 8) t;
  END IF;

  RETURN QUERY SELECT v_total, COALESCE(v_sample, '[]'::jsonb);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.preview_price_increase(text, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_price_increase(text, uuid, numeric, text) TO authenticated;

-- Replace apply function with direction support (always company-scoped for global suppliers)
CREATE OR REPLACE FUNCTION public.apply_price_increase(
  _category text,
  _supplier_id uuid,
  _percentage numeric,
  _direction text DEFAULT 'increase'
)
 RETURNS TABLE(products_affected integer, history_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid(); v_owner uuid; v_scope uuid[];
  v_is_admin boolean; v_supplier_global boolean; v_can boolean := false;
  v_updated integer := 0; v_history uuid;
  v_factor numeric;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _percentage IS NULL OR _percentage <= 0 THEN RAISE EXCEPTION 'Percentual inválido'; END IF;
  IF _direction NOT IN ('increase','decrease') THEN RAISE EXCEPTION 'Tipo de alteração inválido'; END IF;
  IF _direction = 'decrease' AND _percentage >= 100 THEN RAISE EXCEPTION 'Redução deve ser inferior a 100%%'; END IF;
  IF _category IS NULL OR _category = '' THEN RAISE EXCEPTION 'Categoria obrigatória'; END IF;
  IF _supplier_id IS NULL THEN RAISE EXCEPTION 'Fornecedor obrigatório'; END IF;

  v_factor := CASE WHEN _direction = 'decrease' THEN (1 - _percentage/100.0) ELSE (1 + _percentage/100.0) END;

  v_is_admin := public.has_role(v_caller, 'admin');
  v_can := v_is_admin OR public.has_role(v_caller, 'revendedor')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_caller
      AND p.parent_user_id IS NOT NULL AND COALESCE(p.can_create_products, false));
  IF NOT v_can THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  SELECT is_global INTO v_supplier_global FROM public.suppliers WHERE id = _supplier_id;
  IF v_supplier_global IS NULL THEN RAISE EXCEPTION 'Fornecedor não encontrado'; END IF;

  v_owner := public.owner_user_id(v_caller);

  IF v_supplier_global THEN
    -- Global supplier: never touch base catalog. Always upsert per-company overrides.
    WITH ins AS (
      INSERT INTO public.company_product_overrides
        (owner_user_id, global_product_id, base_price_override)
      SELECT v_owner, gp.id,
             round(COALESCE(o.base_price_override, gp.base_price) * v_factor, 2)
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
         SET value_per_meter = round(value_per_meter * v_factor, 2), updated_at = now()
       WHERE category = _category AND supplier_id = _supplier_id AND user_id = ANY(v_scope)
       RETURNING id)
    SELECT COUNT(*)::int INTO v_updated FROM upd;
  END IF;

  INSERT INTO public.price_increase_history
    (user_id, owner_user_id, supplier_id, supplier_is_global, category, percentage, products_affected, direction)
  VALUES
    (v_caller, COALESCE(v_owner, v_caller), _supplier_id, v_supplier_global, _category, _percentage, v_updated, _direction)
  RETURNING id INTO v_history;

  RETURN QUERY SELECT v_updated, v_history;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.apply_price_increase(text, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_price_increase(text, uuid, numeric, text) TO authenticated;

-- Drop old 3-arg overloads to avoid ambiguity
DROP FUNCTION IF EXISTS public.preview_price_increase(text, uuid, numeric);
DROP FUNCTION IF EXISTS public.apply_price_increase(text, uuid, numeric);
