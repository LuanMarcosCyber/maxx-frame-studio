
-- Historico de reajustes
CREATE TABLE public.price_increase_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  supplier_is_global boolean NOT NULL DEFAULT false,
  category text NOT NULL,
  percentage numeric(10,4) NOT NULL,
  products_affected integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.price_increase_history TO authenticated;
GRANT ALL ON public.price_increase_history TO service_role;

ALTER TABLE public.price_increase_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_increase_history_select"
  ON public.price_increase_history FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR user_id = auth.uid()
    OR owner_user_id IN (SELECT public.company_group_owner_ids(public.owner_user_id(auth.uid())))
  );

-- Prévia do reajuste (retorna produtos afetados sem alterar nada)
CREATE OR REPLACE FUNCTION public.preview_price_increase(
  _category text,
  _supplier_id uuid,
  _percentage numeric
)
RETURNS TABLE(
  total integer,
  sample jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_scope uuid[];
  v_is_admin boolean;
  v_supplier_global boolean;
  v_can boolean := false;
  v_total integer := 0;
  v_sample jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _percentage IS NULL OR _percentage <= 0 THEN RAISE EXCEPTION 'Percentual inválido'; END IF;
  IF _category IS NULL OR _category = '' THEN RAISE EXCEPTION 'Categoria obrigatória'; END IF;
  IF _supplier_id IS NULL THEN RAISE EXCEPTION 'Fornecedor obrigatório'; END IF;

  v_is_admin := public.has_role(v_caller, 'admin');
  v_can := v_is_admin
    OR public.has_role(v_caller, 'revendedor')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_caller AND p.parent_user_id IS NOT NULL AND COALESCE(p.can_create_products, false)
    );
  IF NOT v_can THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  SELECT is_global INTO v_supplier_global FROM public.suppliers WHERE id = _supplier_id;
  IF v_supplier_global IS NULL THEN RAISE EXCEPTION 'Fornecedor não encontrado'; END IF;

  v_owner := public.owner_user_id(v_caller);
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_scope
    FROM public.company_group_owner_ids(v_owner) AS t(id);

  IF v_supplier_global AND v_is_admin THEN
    SELECT COUNT(*)::int INTO v_total
      FROM public.products
      WHERE category = _category AND supplier_id = _supplier_id;

    SELECT jsonb_agg(row_to_json(t)) INTO v_sample FROM (
      SELECT code, description, value_per_meter AS current_price,
             round(value_per_meter * (1 + _percentage/100.0), 2) AS new_price
        FROM public.products
       WHERE category = _category AND supplier_id = _supplier_id
       ORDER BY code
       LIMIT 8
    ) t;
  ELSIF v_supplier_global AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Somente Admin pode reajustar catálogo global';
  ELSE
    SELECT COUNT(*)::int INTO v_total
      FROM public.products
      WHERE category = _category
        AND supplier_id = _supplier_id
        AND user_id = ANY(v_scope);

    SELECT jsonb_agg(row_to_json(t)) INTO v_sample FROM (
      SELECT code, description, value_per_meter AS current_price,
             round(value_per_meter * (1 + _percentage/100.0), 2) AS new_price
        FROM public.products
       WHERE category = _category
         AND supplier_id = _supplier_id
         AND user_id = ANY(v_scope)
       ORDER BY code
       LIMIT 8
    ) t;
  END IF;

  RETURN QUERY SELECT v_total, COALESCE(v_sample, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.preview_price_increase(text, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_price_increase(text, uuid, numeric) TO authenticated;

-- Aplica o reajuste em transação
CREATE OR REPLACE FUNCTION public.apply_price_increase(
  _category text,
  _supplier_id uuid,
  _percentage numeric
)
RETURNS TABLE(
  products_affected integer,
  history_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_scope uuid[];
  v_is_admin boolean;
  v_supplier_global boolean;
  v_can boolean := false;
  v_updated integer := 0;
  v_history uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _percentage IS NULL OR _percentage <= 0 THEN RAISE EXCEPTION 'Percentual inválido'; END IF;
  IF _category IS NULL OR _category = '' THEN RAISE EXCEPTION 'Categoria obrigatória'; END IF;
  IF _supplier_id IS NULL THEN RAISE EXCEPTION 'Fornecedor obrigatório'; END IF;

  v_is_admin := public.has_role(v_caller, 'admin');
  v_can := v_is_admin
    OR public.has_role(v_caller, 'revendedor')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_caller AND p.parent_user_id IS NOT NULL AND COALESCE(p.can_create_products, false)
    );
  IF NOT v_can THEN RAISE EXCEPTION 'Sem permissão para reajustar preços'; END IF;

  SELECT is_global INTO v_supplier_global FROM public.suppliers WHERE id = _supplier_id;
  IF v_supplier_global IS NULL THEN RAISE EXCEPTION 'Fornecedor não encontrado'; END IF;

  v_owner := public.owner_user_id(v_caller);
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_scope
    FROM public.company_group_owner_ids(v_owner) AS t(id);

  IF v_supplier_global THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Somente Admin pode reajustar produtos de fornecedor global';
    END IF;
    WITH upd AS (
      UPDATE public.products
         SET value_per_meter = round(value_per_meter * (1 + _percentage/100.0), 2),
             updated_at = now()
       WHERE category = _category AND supplier_id = _supplier_id
       RETURNING id
    )
    SELECT COUNT(*)::int INTO v_updated FROM upd;
  ELSE
    WITH upd AS (
      UPDATE public.products
         SET value_per_meter = round(value_per_meter * (1 + _percentage/100.0), 2),
             updated_at = now()
       WHERE category = _category
         AND supplier_id = _supplier_id
         AND user_id = ANY(v_scope)
       RETURNING id
    )
    SELECT COUNT(*)::int INTO v_updated FROM upd;
  END IF;

  INSERT INTO public.price_increase_history
    (user_id, owner_user_id, supplier_id, supplier_is_global, category, percentage, products_affected)
  VALUES
    (v_caller, COALESCE(v_owner, v_caller), _supplier_id, v_supplier_global, _category, _percentage, v_updated)
  RETURNING id INTO v_history;

  RETURN QUERY SELECT v_updated, v_history;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_price_increase(text, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_price_increase(text, uuid, numeric) TO authenticated;
