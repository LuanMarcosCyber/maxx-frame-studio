
-- 1. Categorias fornecidas
DO $$ BEGIN
  CREATE TYPE public.supplier_category AS ENUM
    ('foam','paspatur','impressao','perfil','vidro','colagem','diversos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tabela de fornecedores
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  is_global boolean NOT NULL DEFAULT false,
  legal_name text,
  trade_name text,
  document text,
  state_registration text,
  email text,
  phone text,
  whatsapp text,
  site text,
  cep text,
  address text,
  address_number text,
  city text,
  state text,
  contact_name text,
  notes text,
  categories public.supplier_category[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_scope_chk CHECK (
    (is_global = true AND user_id IS NULL) OR
    (is_global = false AND user_id IS NOT NULL)
  ),
  CONSTRAINT suppliers_name_chk CHECK (
    coalesce(nullif(btrim(legal_name), ''), nullif(btrim(trade_name), '')) IS NOT NULL
  )
);

CREATE INDEX suppliers_user_id_idx ON public.suppliers(user_id);
CREATE INDEX suppliers_is_global_idx ON public.suppliers(is_global);

-- 3. GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;

-- 4. RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- SELECT: globais são visíveis a todos autenticados; individuais só ao dono/grupo
CREATE POLICY "suppliers_select_visible"
  ON public.suppliers
  FOR SELECT
  TO authenticated
  USING (
    is_global = true
    OR user_id = auth.uid()
    OR user_id = public.owner_user_id(auth.uid())
    OR user_id IN (SELECT public.company_group_owner_ids(public.owner_user_id(auth.uid())))
  );

-- INSERT: admin pode criar global; qualquer usuário pode criar individual escopado ao owner
CREATE POLICY "suppliers_insert_global_admin"
  ON public.suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_global = true AND public.has_role(auth.uid(), 'admin') AND user_id IS NULL
  );

CREATE POLICY "suppliers_insert_individual"
  ON public.suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_global = false
    AND user_id IS NOT NULL
    AND user_id = public.owner_user_id(auth.uid())
  );

-- UPDATE
CREATE POLICY "suppliers_update_global_admin"
  ON public.suppliers
  FOR UPDATE
  TO authenticated
  USING (is_global = true AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (is_global = true AND public.has_role(auth.uid(), 'admin') AND user_id IS NULL);

CREATE POLICY "suppliers_update_individual"
  ON public.suppliers
  FOR UPDATE
  TO authenticated
  USING (is_global = false AND user_id = public.owner_user_id(auth.uid()))
  WITH CHECK (is_global = false AND user_id = public.owner_user_id(auth.uid()));

-- DELETE
CREATE POLICY "suppliers_delete_global_admin"
  ON public.suppliers
  FOR DELETE
  TO authenticated
  USING (is_global = true AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "suppliers_delete_individual"
  ON public.suppliers
  FOR DELETE
  TO authenticated
  USING (is_global = false AND user_id = public.owner_user_id(auth.uid()));

-- 5. Trigger updated_at
CREATE TRIGGER suppliers_set_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Vínculo em products (mantém coluna supplier legada para compatibilidade)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_id uuid
  REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_supplier_id_idx ON public.products(supplier_id);
