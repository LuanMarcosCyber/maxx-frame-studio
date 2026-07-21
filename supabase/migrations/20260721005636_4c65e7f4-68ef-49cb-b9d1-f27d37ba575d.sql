
CREATE OR REPLACE FUNCTION public.natural_key(_s text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT string_agg(
    CASE WHEN part ~ '^\d+$' THEN lpad(part, 20, '0') ELSE lower(part) END,
    '' ORDER BY ord
  )
  FROM regexp_split_to_table(COALESCE(_s,''), '(?<=\D)(?=\d)|(?<=\d)(?=\D)')
       WITH ORDINALITY AS t(part, ord);
$$;

DROP FUNCTION IF EXISTS public.list_visible_products_page(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.list_visible_products_page(
  _category text,
  _search   text,
  _limit    integer,
  _offset   integer
) RETURNS TABLE(
  total_count bigint,
  id uuid, source text, code text, description text, category text,
  supplier text, supplier_id uuid, base_price numeric, effective_price numeric,
  width_cm numeric, ncm text, profit_margin numeric, waste_percentage numeric,
  commission_percentage numeric, labor_cost numeric, has_override boolean,
  config_pending boolean, name text, barcode text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_lim   int := GREATEST(COALESCE(_limit, 100), 1);
  v_off   int := GREATEST(COALESCE(_offset, 0), 0);
  v_q     text := NULLIF(btrim(COALESCE(_search, '')), '');
  v_like  text;
BEGIN
  v_owner := public.owner_user_id(auth.uid());
  IF v_owner IS NULL THEN RETURN; END IF;
  v_like := CASE WHEN v_q IS NULL THEN NULL ELSE '%' || lower(v_q) || '%' END;

  RETURN QUERY
  WITH unified AS (
    SELECT p.id, 'company'::text AS source, p.code, p.description, p.category,
      COALESCE(NULLIF(btrim(s.trade_name), ''), s.legal_name, p.supplier) AS supplier,
      p.supplier_id,
      p.value_per_meter AS base_price,
      p.value_per_meter AS effective_price,
      p.frame_width_cm  AS width_cm,
      p.ncm, p.profit_margin, p.waste_percentage,
      p.commission_percentage, p.labor_cost,
      false AS has_override, false AS config_pending,
      p.name, p.barcode
    FROM public.products p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id
    WHERE p.user_id = v_owner
      AND (_category IS NULL OR p.category = _category)

    UNION ALL

    SELECT gp.id, 'global'::text AS source, gp.code, gp.description, gp.category,
      COALESCE(NULLIF(btrim(s.trade_name), ''), s.legal_name) AS supplier,
      gp.supplier_id,
      gp.base_price,
      COALESCE(o.base_price_override, gp.base_price) AS effective_price,
      gp.width_cm, gp.ncm,
      COALESCE(o.profit_margin, c.margin) AS profit_margin,
      COALESCE(o.waste_percentage, c.loss) AS waste_percentage,
      COALESCE(o.commission_percentage, c.commission) AS commission_percentage,
      COALESCE(o.labor_cost, c.labor_cost) AS labor_cost,
      (o.id IS NOT NULL) AS has_override,
      (o.id IS NULL AND c.supplier_id IS NULL) AS config_pending,
      NULL::text AS name, NULL::text AS barcode
    FROM public.global_supplier_products gp
    JOIN public.suppliers s ON s.id = gp.supplier_id
      AND s.is_global = true AND s.publish_catalog = true
    LEFT JOIN public.company_product_overrides o
      ON o.global_product_id = gp.id AND o.owner_user_id = v_owner
    LEFT JOIN public.company_supplier_config c
      ON c.owner_user_id = v_owner AND c.supplier_id = gp.supplier_id
    WHERE gp.active = true
      AND (_category IS NULL OR gp.category = _category)
  ),
  filtered AS (
    SELECT * FROM unified
    WHERE v_like IS NULL
       OR lower(code)               LIKE v_like
       OR lower(COALESCE(description,'')) LIKE v_like
       OR lower(COALESCE(name,''))        LIKE v_like
       OR lower(COALESCE(supplier,''))    LIKE v_like
       OR lower(COALESCE(barcode,''))     LIKE v_like
  ),
  counted AS (
    SELECT (SELECT count(*) FROM filtered) AS total_count, f.*
    FROM filtered f
  )
  SELECT total_count, id, source, code, description, category, supplier,
         supplier_id, base_price, effective_price, width_cm, ncm,
         profit_margin, waste_percentage, commission_percentage, labor_cost,
         has_override, config_pending, name, barcode
  FROM counted
  ORDER BY public.natural_key(code) ASC
  LIMIT v_lim OFFSET v_off;
END; $$;

REVOKE EXECUTE ON FUNCTION public.list_visible_products_page(text, text, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_visible_products_page(text, text, integer, integer) TO authenticated;
