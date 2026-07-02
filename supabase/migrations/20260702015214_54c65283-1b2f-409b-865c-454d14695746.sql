
-- 1. account_type enum + coluna em profiles
DO $$ BEGIN
  CREATE TYPE public.account_type AS ENUM ('admin','revendedor','operacional');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type public.account_type;

UPDATE public.profiles
  SET account_type = CASE
    WHEN parent_user_id IS NOT NULL THEN 'operacional'::public.account_type
    ELSE 'revendedor'::public.account_type
  END
  WHERE account_type IS NULL;

-- 2. Tabela operators
CREATE TABLE IF NOT EXISTS public.operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operational_account_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  nickname text,
  pin_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  can_edit_budgets boolean NOT NULL DEFAULT true,
  can_create_products boolean NOT NULL DEFAULT true,
  can_create_clients boolean NOT NULL DEFAULT true,
  can_delete_orders boolean NOT NULL DEFAULT false,
  max_discount_percent numeric(5,2) NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operators_owner_idx ON public.operators(owner_user_id);
CREATE INDEX IF NOT EXISTS operators_opacct_idx ON public.operators(operational_account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operators TO authenticated;
GRANT ALL ON public.operators TO service_role;

ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer conta da loja vê seus operadores; contas operacionais só veem os da própria conta
CREATE POLICY "operators_select" ON public.operators
  FOR SELECT TO authenticated
  USING (
    owner_user_id = public.owner_user_id(auth.uid())
    AND (
      NOT public.is_collaborator(auth.uid())
      OR operational_account_id = auth.uid()
    )
  );

-- INSERT: dono/admin livre na sua loja; conta operacional só se operational_account_id = auth.uid()
CREATE POLICY "operators_insert" ON public.operators
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_user_id = public.owner_user_id(auth.uid())
    AND (
      NOT public.is_collaborator(auth.uid())
      OR operational_account_id = auth.uid()
    )
  );

CREATE POLICY "operators_update" ON public.operators
  FOR UPDATE TO authenticated
  USING (
    owner_user_id = public.owner_user_id(auth.uid())
    AND (
      NOT public.is_collaborator(auth.uid())
      OR operational_account_id = auth.uid()
    )
  );

CREATE POLICY "operators_delete" ON public.operators
  FOR DELETE TO authenticated
  USING (
    owner_user_id = public.owner_user_id(auth.uid())
    AND (
      NOT public.is_collaborator(auth.uid())
      OR operational_account_id = auth.uid()
    )
  );

-- trigger updated_at
DROP TRIGGER IF EXISTS operators_set_updated_at ON public.operators;
CREATE TRIGGER operators_set_updated_at
  BEFORE UPDATE ON public.operators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Remover FK antiga de budgets.operator_id / orders.operator_id (apontava para auth.users)
ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_operator_id_fkey;
ALTER TABLE public.orders  DROP CONSTRAINT IF EXISTS orders_operator_id_fkey;
