
-- 1. Profiles: parent (revendedor responsável) + active flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS parent_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS profiles_parent_user_id_idx ON public.profiles(parent_user_id);

-- 2. Helper: resolve owner (revendedor) for a given user
CREATE OR REPLACE FUNCTION public.owner_user_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT parent_user_id FROM public.profiles WHERE id = _user_id AND parent_user_id IS NOT NULL),
    _user_id
  )
$$;

REVOKE ALL ON FUNCTION public.owner_user_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_user_id(uuid) TO authenticated, service_role;

-- 3. handle_new_user: persist parent_user_id from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
  v_parent uuid;
BEGIN
  v_parent := NULLIF(NEW.raw_user_meta_data->>'parent_user_id', '')::uuid;

  INSERT INTO public.profiles (id, full_name, username, parent_user_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'username',
    v_parent
  );

  v_role := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'role', '')::public.app_role,
    'revendedor'::public.app_role
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role);
  RETURN NEW;
END;
$$;

-- 4. Products policies
DROP POLICY IF EXISTS "View products" ON public.products;
DROP POLICY IF EXISTS "Insert own products" ON public.products;
DROP POLICY IF EXISTS "Update own products" ON public.products;
DROP POLICY IF EXISTS "Delete own products" ON public.products;

CREATE POLICY "View products" ON public.products
FOR SELECT TO authenticated
USING (
  public.owner_user_id(auth.uid()) = user_id
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Insert own products" ON public.products
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'revendedor')
  )
);

CREATE POLICY "Update own products" ON public.products
FOR UPDATE TO authenticated
USING (
  (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'revendedor')
  )
);

CREATE POLICY "Delete own products" ON public.products
FOR DELETE TO authenticated
USING (
  (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'revendedor')
  )
);

-- 5. Budgets policies
DROP POLICY IF EXISTS "View budgets" ON public.budgets;
DROP POLICY IF EXISTS "Insert own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Update own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Delete own budgets" ON public.budgets;

CREATE POLICY "View budgets" ON public.budgets
FOR SELECT TO authenticated
USING (
  public.owner_user_id(auth.uid()) = user_id
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Insert own budgets" ON public.budgets
FOR INSERT TO authenticated
WITH CHECK (
  user_id = public.owner_user_id(auth.uid())
);

CREATE POLICY "Update own budgets" ON public.budgets
FOR UPDATE TO authenticated
USING (
  public.owner_user_id(auth.uid()) = user_id
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Delete own budgets" ON public.budgets
FOR DELETE TO authenticated
USING (
  public.owner_user_id(auth.uid()) = user_id
  OR public.has_role(auth.uid(), 'admin')
);

-- 6. Budget items policies
DROP POLICY IF EXISTS "Users can view own budget_items" ON public.budget_items;
DROP POLICY IF EXISTS "Users can insert own budget_items" ON public.budget_items;
DROP POLICY IF EXISTS "Users can update own budget_items" ON public.budget_items;
DROP POLICY IF EXISTS "Users can delete own budget_items" ON public.budget_items;

CREATE POLICY "Users can view own budget_items" ON public.budget_items
FOR SELECT TO authenticated
USING (
  public.owner_user_id(auth.uid()) = user_id
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can insert own budget_items" ON public.budget_items
FOR INSERT TO authenticated
WITH CHECK (
  user_id = public.owner_user_id(auth.uid())
);

CREATE POLICY "Users can update own budget_items" ON public.budget_items
FOR UPDATE TO authenticated
USING (
  public.owner_user_id(auth.uid()) = user_id
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can delete own budget_items" ON public.budget_items
FOR DELETE TO authenticated
USING (
  public.owner_user_id(auth.uid()) = user_id
  OR public.has_role(auth.uid(), 'admin')
);

-- 7. Orders policies
DROP POLICY IF EXISTS "View orders" ON public.orders;
DROP POLICY IF EXISTS "Insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Update own orders" ON public.orders;
DROP POLICY IF EXISTS "Delete own orders" ON public.orders;

CREATE POLICY "View orders" ON public.orders
FOR SELECT TO authenticated
USING (
  public.owner_user_id(auth.uid()) = user_id
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Insert own orders" ON public.orders
FOR INSERT TO authenticated
WITH CHECK (
  user_id = public.owner_user_id(auth.uid())
);

CREATE POLICY "Update own orders" ON public.orders
FOR UPDATE TO authenticated
USING (
  public.owner_user_id(auth.uid()) = user_id
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Delete own orders" ON public.orders
FOR DELETE TO authenticated
USING (
  public.owner_user_id(auth.uid()) = user_id
  OR public.has_role(auth.uid(), 'admin')
);
