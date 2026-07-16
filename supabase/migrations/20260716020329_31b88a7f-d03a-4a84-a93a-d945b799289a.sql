
-- =========================================================
-- FASE 1: FUNDAÇÃO DO CATÁLOGO GLOBAL
-- =========================================================

-- 1) suppliers.publish_catalog
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS publish_catalog boolean NOT NULL DEFAULT false;

-- Migrar flag antiga para nova (fornecedores globais com auto_distribute → publish_catalog)
UPDATE public.suppliers
   SET publish_catalog = true
 WHERE is_global = true
   AND auto_distribute = true
   AND distribute_category IS NOT NULL;

-- 2) global_supplier_products
CREATE TABLE IF NOT EXISTS public.global_supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  category text NOT NULL,
  code text NOT NULL,
  description text NOT NULL,
  base_price numeric(12,2) NOT NULL DEFAULT 0,
  width_cm numeric(8,2),
  ncm text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, category, code)
);

CREATE INDEX IF NOT EXISTS idx_gsp_supplier_cat ON public.global_supplier_products (supplier_id, category);

GRANT SELECT ON public.global_supplier_products TO authenticated;
GRANT ALL ON public.global_supplier_products TO service_role;

ALTER TABLE public.global_supplier_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view global catalog"
  ON public.global_supplier_products FOR SELECT
  TO authenticated
  USING (
    active = true
    AND EXISTS (
      SELECT 1 FROM public.suppliers s
       WHERE s.id = supplier_id AND s.is_global = true AND s.publish_catalog = true
    )
  );

CREATE POLICY "Admin can view all global catalog rows"
  ON public.global_supplier_products FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can insert global catalog"
  ON public.global_supplier_products FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can update global catalog"
  ON public.global_supplier_products FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete global catalog"
  ON public.global_supplier_products FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_gsp_updated
  BEFORE UPDATE ON public.global_supplier_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) company_product_overrides
CREATE TABLE IF NOT EXISTS public.company_product_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  global_product_id uuid NOT NULL REFERENCES public.global_supplier_products(id) ON DELETE CASCADE,
  profit_margin numeric(8,2),
  waste_percentage numeric(8,2),
  commission_percentage numeric(8,2),
  labor_cost numeric(12,2),
  base_price_override numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, global_product_id)
);

CREATE INDEX IF NOT EXISTS idx_cpo_owner ON public.company_product_overrides (owner_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_product_overrides TO authenticated;
GRANT ALL ON public.company_product_overrides TO service_role;

ALTER TABLE public.company_product_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company can manage its overrides"
  ON public.company_product_overrides FOR ALL
  TO authenticated
  USING (owner_user_id = public.owner_user_id(auth.uid()))
  WITH CHECK (owner_user_id = public.owner_user_id(auth.uid()));

CREATE TRIGGER trg_cpo_updated
  BEFORE UPDATE ON public.company_product_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) BACKUP das cópias distribuídas antes de remover
CREATE TABLE IF NOT EXISTS public._backup_products_pre_global AS
SELECT p.*, now() AS backup_at
  FROM public.products p
 WHERE p.source_global_product_id IS NOT NULL
   AND false; -- create empty structure first

-- Popular backup (idempotente por id)
INSERT INTO public._backup_products_pre_global
SELECT p.*, now()
  FROM public.products p
 WHERE p.source_global_product_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public._backup_products_pre_global b WHERE b.id = p.id
   );

-- 5) Remover triggers e funções da distribuição antiga
DROP TRIGGER IF EXISTS trg_distribute_on_new_company ON public.profiles;
DROP TRIGGER IF EXISTS trg_replicate_new_global_product ON public.products;

DROP FUNCTION IF EXISTS public.distribute_on_new_company() CASCADE;
DROP FUNCTION IF EXISTS public.replicate_new_global_product() CASCADE;
DROP FUNCTION IF EXISTS public.distribute_auto_products(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.ensure_auto_distribution() CASCADE;

-- 6) Apagar cópias distribuídas (já em backup)
DELETE FROM public.products WHERE source_global_product_id IS NOT NULL;

-- 7) list_visible_products: leitura unificada por empresa ativa
CREATE OR REPLACE FUNCTION public.list_visible_products()
RETURNS TABLE (
  id uuid,
  source text,           -- 'company' | 'global'
  code text,
  description text,
  category text,
  supplier text,
  supplier_id uuid,
  base_price numeric,
  effective_price numeric,
  width_cm numeric,
  ncm text,
  profit_margin numeric,
  waste_percentage numeric,
  commission_percentage numeric,
  labor_cost numeric,
  has_override boolean,
  config_pending boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  v_owner := public.owner_user_id(auth.uid());
  IF v_owner IS NULL THEN RETURN; END IF;

  -- (a) Produtos particulares da empresa ativa
  RETURN QUERY
  SELECT
    p.id,
    'company'::text AS source,
    p.code,
    p.description,
    p.category,
    COALESCE(NULLIF(btrim(s.trade_name), ''), s.legal_name, p.supplier) AS supplier,
    p.supplier_id,
    p.value_per_meter AS base_price,
    p.value_per_meter AS effective_price,
    p.frame_width_cm AS width_cm,
    p.ncm,
    p.profit_margin,
    p.waste_percentage,
    p.commission_percentage,
    p.labor_cost,
    false AS has_override,
    false AS config_pending
  FROM public.products p
  LEFT JOIN public.suppliers s ON s.id = p.supplier_id
  WHERE p.user_id = v_owner;

  -- (b) Catálogo global publicado, com override/config-padrão da empresa
  RETURN QUERY
  SELECT
    gp.id,
    'global'::text AS source,
    gp.code,
    gp.description,
    gp.category,
    COALESCE(NULLIF(btrim(s.trade_name), ''), s.legal_name) AS supplier,
    gp.supplier_id,
    gp.base_price,
    COALESCE(o.base_price_override, gp.base_price) AS effective_price,
    gp.width_cm,
    gp.ncm,
    COALESCE(o.profit_margin, c.margin) AS profit_margin,
    COALESCE(o.waste_percentage, c.loss) AS waste_percentage,
    COALESCE(o.commission_percentage, c.commission) AS commission_percentage,
    COALESCE(o.labor_cost, c.labor_cost) AS labor_cost,
    (o.id IS NOT NULL) AS has_override,
    (o.id IS NULL AND c.supplier_id IS NULL) AS config_pending
  FROM public.global_supplier_products gp
  JOIN public.suppliers s
    ON s.id = gp.supplier_id AND s.is_global = true AND s.publish_catalog = true
  LEFT JOIN public.company_product_overrides o
    ON o.global_product_id = gp.id AND o.owner_user_id = v_owner
  LEFT JOIN public.company_supplier_config c
    ON c.owner_user_id = v_owner AND c.supplier_id = gp.supplier_id
  WHERE gp.active = true;
END; $$;

REVOKE EXECUTE ON FUNCTION public.list_visible_products() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_visible_products() TO authenticated;

-- 8) Atualizar get_supplier_wizard_state para usar publish_catalog (sem depender de auto_distribute/distribute_category)
CREATE OR REPLACE FUNCTION public.get_supplier_wizard_state()
RETURNS TABLE(supplier_id uuid, supplier_name text, category text, product_count integer, configured boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
       WHERE c.owner_user_id = v_owner AND c.supplier_id = s.id
    )
  FROM public.suppliers s
  JOIN public.global_supplier_products gp
    ON gp.supplier_id = s.id AND gp.active = true
  WHERE s.is_global = true AND s.publish_catalog = true
  GROUP BY s.id, s.trade_name, s.legal_name, gp.category
  ORDER BY gp.category;
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_supplier_wizard_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_wizard_state() TO authenticated;
