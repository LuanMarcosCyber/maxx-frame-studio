
-- 1) clients table
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  whatsapp text,
  email text,
  document text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Owner = revendedor pai (para colaboradores) ou o próprio usuário. Admin vê tudo.
CREATE POLICY "View clients" ON public.clients FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR user_id = COALESCE(public.owner_user_id(auth.uid()), auth.uid())
  );

CREATE POLICY "Insert clients" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR user_id = COALESCE(public.owner_user_id(auth.uid()), auth.uid())
  );

CREATE POLICY "Update clients" ON public.clients FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR user_id = COALESCE(public.owner_user_id(auth.uid()), auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR user_id = COALESCE(public.owner_user_id(auth.uid()), auth.uid())
  );

CREATE POLICY "Delete clients" ON public.clients FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR user_id = COALESCE(public.owner_user_id(auth.uid()), auth.uid())
  );

CREATE INDEX clients_user_id_idx ON public.clients (user_id);
CREATE INDEX clients_name_idx ON public.clients (lower(name));

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) budgets.client_id (opcional)
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS client_id uuid NULL REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS budgets_client_id_idx ON public.budgets (client_id);
