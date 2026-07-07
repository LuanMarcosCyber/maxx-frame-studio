
-- Vínculo entre Empresas (matriz/filial/grupo)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_group_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_company_group_id ON public.profiles(company_group_id);

-- Retorna todos os owner_user_ids que compartilham cadastros com _owner
-- Grupo = matriz (o próprio owner, ou o company_group_id dele) + todas as filiais que apontam para a matriz
CREATE OR REPLACE FUNCTION public.company_group_owner_ids(_owner uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH matriz AS (
    SELECT COALESCE(
      (SELECT p.company_group_id FROM public.profiles p WHERE p.id = _owner AND p.company_group_id IS NOT NULL),
      _owner
    ) AS id
  )
  SELECT id FROM matriz
  UNION
  SELECT p.id FROM public.profiles p, matriz m WHERE p.company_group_id = m.id;
$$;

-- Bloquear alteração de company_group_id por não-admins
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF OLD.parent_user_id IS NOT NULL AND OLD.parent_user_id = auth.uid() THEN
    IF NEW.company_group_id IS DISTINCT FROM OLD.company_group_id THEN
      RAISE EXCEPTION 'Not authorized to modify company group link';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.parent_user_id IS DISTINCT FROM OLD.parent_user_id
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.can_edit_budgets IS DISTINCT FROM OLD.can_edit_budgets
     OR NEW.can_create_products IS DISTINCT FROM OLD.can_create_products
     OR NEW.can_create_clients IS DISTINCT FROM OLD.can_create_clients
     OR NEW.can_delete_orders IS DISTINCT FROM OLD.can_delete_orders
     OR NEW.max_discount_percent IS DISTINCT FROM OLD.max_discount_percent
     OR NEW.company_group_id IS DISTINCT FROM OLD.company_group_id
  THEN
    RAISE EXCEPTION 'Not authorized to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$$;

-- Atualizar políticas SELECT para permitir ver cadastros das empresas do mesmo grupo
-- (INSERT/UPDATE/DELETE permanecem restritos ao dono — só visualizar/usar)

DROP POLICY IF EXISTS "View products" ON public.products;
CREATE POLICY "View products" ON public.products
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id IN (SELECT public.company_group_owner_ids(public.owner_user_id(auth.uid())))
);

DROP POLICY IF EXISTS "View clients" ON public.clients;
CREATE POLICY "View clients" ON public.clients
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id IN (SELECT public.company_group_owner_ids(public.owner_user_id(auth.uid())))
);

DROP POLICY IF EXISTS "View architects" ON public.architects;
CREATE POLICY "View architects" ON public.architects
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id IN (SELECT public.company_group_owner_ids(public.owner_user_id(auth.uid())))
);

DROP POLICY IF EXISTS "View carriers" ON public.carriers;
CREATE POLICY "View carriers" ON public.carriers
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id IN (SELECT public.company_group_owner_ids(public.owner_user_id(auth.uid())))
);
