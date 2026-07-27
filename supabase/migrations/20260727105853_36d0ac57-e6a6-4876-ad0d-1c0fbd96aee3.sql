CREATE OR REPLACE FUNCTION public.list_visible_products_page(_category text, _search text, _limit integer, _offset integer)
 RETURNS TABLE(total_count bigint, id uuid, source text, code text, description text, category text, supplier text, supplier_id uuid, base_price numeric, effective_price numeric, width_cm numeric, ncm text, profit_margin numeric, waste_percentage numeric, commission_percentage numeric, labor_cost numeric, has_override boolean, config_pending boolean, name text, barcode text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT p.id AS u_id, 'company'::text AS u_source, p.code AS u_code, p.description AS u_description, p.category AS u_category,
      COALESCE(NULLIF(btrim(s.trade_name), ''), s.legal_name, p.supplier) AS u_supplier,
      p.supplier_id AS u_supplier_id,
      p.value_per_meter AS u_base_price,
      p.value_per_meter AS u_effective_price,
      p.frame_width_cm  AS u_width_cm,
      p.ncm AS u_ncm, p.profit_margin AS u_profit_margin, p.waste_percentage AS u_waste_percentage,
      p.commission_percentage AS u_commission_percentage, p.labor_cost AS u_labor_cost,
      false AS u_has_override, false AS u_config_pending,
      p.name AS u_name, p.barcode AS u_barcode
    FROM public.products p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id
    WHERE p.user_id = v_owner
      AND (_category IS NULL OR p.category = _category)

    UNION ALL

    SELECT gp.id, 'global'::text, gp.code, gp.description, gp.category,
      COALESCE(NULLIF(btrim(s.trade_name), ''), s.legal_name),
      gp.supplier_id,
      gp.base_price,
      COALESCE(o.base_price_override, gp.base_price),
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
    WHERE gp.active = true
      AND (_category IS NULL OR gp.category = _category)
  ),
  filtered AS (
    SELECT u.* FROM unified u
    WHERE v_like IS NULL
       OR lower(u.u_code)                        LIKE v_like
       OR lower(COALESCE(u.u_description,''))    LIKE v_like
       OR lower(COALESCE(u.u_name,''))           LIKE v_like
       OR lower(COALESCE(u.u_supplier,''))       LIKE v_like
       OR lower(COALESCE(u.u_barcode,''))        LIKE v_like
  )
  SELECT (SELECT count(*) FROM filtered)::bigint,
         f.u_id, f.u_source, f.u_code, f.u_description, f.u_category, f.u_supplier,
         f.u_supplier_id, f.u_base_price, f.u_effective_price, f.u_width_cm, f.u_ncm,
         f.u_profit_margin, f.u_waste_percentage, f.u_commission_percentage, f.u_labor_cost,
         f.u_has_override, f.u_config_pending, f.u_name, f.u_barcode
  FROM filtered f
  ORDER BY public.natural_key(f.u_code) ASC
  LIMIT v_lim OFFSET v_off;
END; $function$;