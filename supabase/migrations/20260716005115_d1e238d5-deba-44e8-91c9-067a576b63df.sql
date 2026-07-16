
-- 1) Suppliers flags
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS auto_distribute boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS distribute_category text;

UPDATE public.suppliers
   SET auto_distribute = true, distribute_category = 'Perfil'
 WHERE is_global = true AND legal_name ILIKE 'SUL AMERICA%';

UPDATE public.suppliers
   SET auto_distribute = true, distribute_category = 'Paspatur'
 WHERE is_global = true AND legal_name ILIKE 'TOTAL MAXX%';

-- 2) Products flags
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS uses_default_config boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_global_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_source_global_idx ON public.products(source_global_product_id);
CREATE UNIQUE INDEX IF NOT EXISTS products_owner_source_uniq
  ON public.products(user_id, source_global_product_id)
  WHERE source_global_product_id IS NOT NULL;

-- 3) Company supplier config
CREATE TABLE IF NOT EXISTS public.company_supplier_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  margin numeric NOT NULL DEFAULT 0,
  loss numeric NOT NULL DEFAULT 0,
  commission numeric NOT NULL DEFAULT 0,
  labor_cost numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, supplier_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_supplier_config TO authenticated;
GRANT ALL ON public.company_supplier_config TO service_role;

ALTER TABLE public.company_supplier_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "csc_select_own" ON public.company_supplier_config;
CREATE POLICY "csc_select_own" ON public.company_supplier_config
  FOR SELECT TO authenticated
  USING (owner_user_id = public.owner_user_id(auth.uid()) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "csc_write_own" ON public.company_supplier_config;
CREATE POLICY "csc_write_own" ON public.company_supplier_config
  FOR ALL TO authenticated
  USING (owner_user_id = public.owner_user_id(auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (owner_user_id = public.owner_user_id(auth.uid()) OR public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS csc_updated_at ON public.company_supplier_config;
CREATE TRIGGER csc_updated_at BEFORE UPDATE ON public.company_supplier_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Distribute auto-products for a single owner (idempotent)
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

REVOKE ALL ON FUNCTION public.distribute_auto_products(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distribute_auto_products(uuid) TO authenticated, service_role;

-- 5) Ensure distribution for the current caller's company
CREATE OR REPLACE FUNCTION public.ensure_auto_distribution()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  v_owner := public.owner_user_id(auth.uid());
  IF v_owner IS NULL THEN RETURN 0; END IF;
  RETURN public.distribute_auto_products(v_owner);
END; $$;

REVOKE ALL ON FUNCTION public.ensure_auto_distribution() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_auto_distribution() TO authenticated;

-- 6) Wizard state — which auto-distribute suppliers still need config
CREATE OR REPLACE FUNCTION public.get_supplier_wizard_state()
RETURNS TABLE (
  supplier_id uuid,
  supplier_name text,
  category text,
  product_count integer,
  configured boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  v_owner := public.owner_user_id(auth.uid());
  IF v_owner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    s.id,
    COALESCE(NULLIF(btrim(s.trade_name), ''), s.legal_name),
    s.distribute_category,
    (SELECT COUNT(*)::int FROM public.products p
       WHERE p.user_id = v_owner
         AND p.supplier_id = s.id
         AND p.category = s.distribute_category),
    EXISTS (
      SELECT 1 FROM public.company_supplier_config c
       WHERE c.owner_user_id = v_owner AND c.supplier_id = s.id
    )
  FROM public.suppliers s
  WHERE s.is_global = true AND s.auto_distribute = true AND s.distribute_category IS NOT NULL
  ORDER BY s.distribute_category;
END; $$;

REVOKE ALL ON FUNCTION public.get_supplier_wizard_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_wizard_state() TO authenticated;

-- 7) Apply default supplier config to all still-default products
CREATE OR REPLACE FUNCTION public.apply_supplier_default_config(
  _supplier_id uuid,
  _margin numeric,
  _loss numeric,
  _commission numeric,
  _labor_cost numeric
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid; v_count integer := 0;
BEGIN
  v_owner := public.owner_user_id(auth.uid());
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _supplier_id IS NULL THEN RAISE EXCEPTION 'supplier_id required'; END IF;
  IF _margin IS NULL OR _margin < 0 THEN RAISE EXCEPTION 'Margem inválida'; END IF;
  IF _loss IS NULL OR _loss < 0 THEN RAISE EXCEPTION 'Perda inválida'; END IF;
  IF _commission IS NULL OR _commission < 0 THEN RAISE EXCEPTION 'Comissão inválida'; END IF;

  INSERT INTO public.company_supplier_config (owner_user_id, supplier_id, margin, loss, commission, labor_cost)
  VALUES (v_owner, _supplier_id, _margin, _loss, _commission, _labor_cost)
  ON CONFLICT (owner_user_id, supplier_id) DO UPDATE
    SET margin = EXCLUDED.margin,
        loss = EXCLUDED.loss,
        commission = EXCLUDED.commission,
        labor_cost = EXCLUDED.labor_cost,
        updated_at = now();

  WITH upd AS (
    UPDATE public.products
       SET profit_margin = _margin,
           waste_percentage = _loss,
           commission_percentage = _commission,
           labor_cost = COALESCE(_labor_cost, labor_cost),
           updated_at = now()
     WHERE user_id = v_owner
       AND supplier_id = _supplier_id
       AND uses_default_config = true
     RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM upd;

  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.apply_supplier_default_config(uuid,numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_supplier_default_config(uuid,numeric,numeric,numeric,numeric) TO authenticated;

-- 8) Auto-mark a product as personalized when user edits commercial fields
CREATE OR REPLACE FUNCTION public.mark_product_personalized()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.uses_default_config = true THEN
    IF NEW.profit_margin IS DISTINCT FROM OLD.profit_margin
       OR NEW.waste_percentage IS DISTINCT FROM OLD.waste_percentage
       OR NEW.commission_percentage IS DISTINCT FROM OLD.commission_percentage
       OR NEW.labor_cost IS DISTINCT FROM OLD.labor_cost
       OR NEW.value_per_meter IS DISTINCT FROM OLD.value_per_meter
    THEN
      NEW.uses_default_config := false;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS products_mark_personalized ON public.products;
CREATE TRIGGER products_mark_personalized
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.mark_product_personalized();

-- 9) When Admin inserts a new GLOBAL product for an auto-distribute supplier,
--    replicate to every existing company owner (parent_user_id IS NULL, active)
CREATE OR REPLACE FUNCTION public.replicate_new_global_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_supplier public.suppliers%ROWTYPE;
BEGIN
  IF NEW.supplier_id IS NULL OR NEW.source_global_product_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_supplier FROM public.suppliers WHERE id = NEW.supplier_id;
  IF NOT FOUND OR v_supplier.is_global IS NOT TRUE
     OR v_supplier.auto_distribute IS NOT TRUE
     OR v_supplier.distribute_category IS NULL
     OR NEW.category IS DISTINCT FROM v_supplier.distribute_category
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.products (
    user_id, code, description, category, supplier, supplier_id,
    value_per_meter, profit_margin, waste_percentage, commission_percentage, labor_cost,
    frame_width_cm, ncm, name, barcode,
    uses_default_config, source_global_product_id
  )
  SELECT
    pr.id, NEW.code, NEW.description, NEW.category,
    COALESCE(v_supplier.trade_name, v_supplier.legal_name), NEW.supplier_id,
    NEW.value_per_meter,
    COALESCE(c.margin, 0),
    COALESCE(c.loss, 0),
    COALESCE(c.commission, 0),
    COALESCE(c.labor_cost, 0),
    NEW.frame_width_cm, NEW.ncm, NEW.name, NEW.barcode,
    true, NEW.id
  FROM public.profiles pr
  LEFT JOIN public.company_supplier_config c
    ON c.owner_user_id = pr.id AND c.supplier_id = NEW.supplier_id
  WHERE pr.parent_user_id IS NULL
    AND pr.active = true
    AND pr.id <> NEW.user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.products p2
       WHERE p2.user_id = pr.id AND p2.source_global_product_id = NEW.id
    );

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS products_replicate_new_global ON public.products;
CREATE TRIGGER products_replicate_new_global
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.replicate_new_global_product();

-- 10) When a NEW company profile is created (parent_user_id NULL), distribute auto products
CREATE OR REPLACE FUNCTION public.distribute_on_new_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.parent_user_id IS NULL AND COALESCE(NEW.active, true) = true THEN
    PERFORM public.distribute_auto_products(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS profiles_distribute_auto ON public.profiles;
CREATE TRIGGER profiles_distribute_auto
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.distribute_on_new_company();
