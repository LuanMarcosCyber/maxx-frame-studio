
-- Detecção da Configuração Inicial por (fornecedor global, categoria).
-- Configurado = existe company_supplier_config para o par (owner, supplier)
-- com margem, perda e comissão preenchidas. Para categoria Perfil,
-- mão de obra também é obrigatória.

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
         AND c.commission IS NOT NULL
         AND (gp.category <> 'Perfil' OR c.labor_cost IS NOT NULL)
    )
  FROM public.suppliers s
  JOIN public.global_supplier_products gp
    ON gp.supplier_id = s.id AND gp.active = true
  WHERE s.is_global = true AND s.publish_catalog = true
  GROUP BY s.id, s.trade_name, s.legal_name, gp.category
  ORDER BY gp.category;
END; $function$;

-- Limpa configurações herdadas do antigo gatilho de auto-distribuição
-- para que cada empresa/admin passe pelo assistente ao menos uma vez.
-- Mantém apenas configurações não-nulas escolhidas explicitamente.
DELETE FROM public.company_supplier_config c
 USING public.suppliers s
 WHERE c.supplier_id = s.id
   AND s.is_global = true
   AND (c.margin IS NULL OR c.loss IS NULL OR c.commission IS NULL
        OR (c.margin = 0 AND c.loss = 0 AND c.commission = 0));
