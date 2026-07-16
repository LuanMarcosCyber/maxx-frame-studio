
-- Remove cópias duplicadas acidentais no próprio dono
DELETE FROM public.products p
 USING public.products gp
 WHERE p.source_global_product_id = gp.id
   AND p.user_id = gp.user_id;

CREATE OR REPLACE FUNCTION public.distribute_auto_products(_owner_user_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer := 0;
BEGIN
  IF _owner_user_id IS NULL THEN RETURN 0; END IF;

  WITH ins AS (
    INSERT INTO public.products (
      user_id, code, description, category, supplier, supplier_id,
      value_per_meter, profit_margin, waste_percentage, commission_percentage, labor_cost,
      frame_width_cm, ncm, name, barcode,
      uses_default_config, source_global_product_id
    )
    SELECT
      _owner_user_id, gp.code, gp.description, gp.category,
      COALESCE(s.trade_name, s.legal_name), gp.supplier_id,
      gp.value_per_meter,
      COALESCE((SELECT margin      FROM public.company_supplier_config c WHERE c.owner_user_id = _owner_user_id AND c.supplier_id = gp.supplier_id), 0),
      COALESCE((SELECT loss        FROM public.company_supplier_config c WHERE c.owner_user_id = _owner_user_id AND c.supplier_id = gp.supplier_id), 0),
      COALESCE((SELECT commission  FROM public.company_supplier_config c WHERE c.owner_user_id = _owner_user_id AND c.supplier_id = gp.supplier_id), 0),
      COALESCE((SELECT labor_cost  FROM public.company_supplier_config c WHERE c.owner_user_id = _owner_user_id AND c.supplier_id = gp.supplier_id), 0),
      gp.frame_width_cm, gp.ncm, gp.name, gp.barcode,
      true, gp.id
    FROM public.products gp
    JOIN public.suppliers s ON s.id = gp.supplier_id
    WHERE s.is_global = true
      AND s.auto_distribute = true
      AND s.distribute_category IS NOT NULL
      AND gp.category = s.distribute_category
      AND gp.source_global_product_id IS NULL
      AND gp.user_id <> _owner_user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.products p2
         WHERE p2.user_id = _owner_user_id
           AND p2.source_global_product_id = gp.id
      )
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM ins;

  RETURN v_count;
END; $$;
