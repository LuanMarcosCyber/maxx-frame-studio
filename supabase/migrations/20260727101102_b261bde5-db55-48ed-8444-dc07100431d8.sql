-- 1) Campos comerciais adicionais em profiles (para o cadastro de empresas).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS state_registration text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS neighborhood text;

-- 2) Relaxa detecção: comissão é apenas gerencial e não deve bloquear.
CREATE OR REPLACE FUNCTION public.get_supplier_wizard_state()
 RETURNS TABLE(supplier_id uuid, supplier_name text, category text, product_count integer, configured boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_owner uuid;
BEGIN
  v_owner := public.owner_user_id(auth.uid());
  IF v_owner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    s.id,
    COALESCE(NULLIF(btrim(s.trade_name), ''), s.legal_name),
    gp.category,
    COUNT(gp.id)::int,
    EXISTS (
      SELECT 1 FROM public.company_supplier_config c
       WHERE c.owner_user_id = v_owner
         AND c.supplier_id = s.id
         AND c.margin IS NOT NULL
         AND c.loss IS NOT NULL
         AND (gp.category <> 'Perfil' OR c.labor_cost IS NOT NULL)
    )
  FROM public.suppliers s
  JOIN public.global_supplier_products gp
    ON gp.supplier_id = s.id AND gp.active = true
  WHERE s.is_global = true AND s.publish_catalog = true
  GROUP BY s.id, s.trade_name, s.legal_name, gp.category
  ORDER BY gp.category;
END; $function$;

REVOKE ALL ON FUNCTION public.get_supplier_wizard_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_wizard_state() TO authenticated;