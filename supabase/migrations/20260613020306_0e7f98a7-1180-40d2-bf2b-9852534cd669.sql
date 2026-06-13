
-- Restrict normal-screen visibility: Admin no longer sees Revendedores' data.
-- Sharing remains only between Revendedor and their Colaboradores via owner_user_id().

-- PRODUCTS
DROP POLICY IF EXISTS "View products" ON public.products;
CREATE POLICY "View products" ON public.products
  FOR SELECT USING (owner_user_id(auth.uid()) = user_id);

DROP POLICY IF EXISTS "Update own products" ON public.products;
CREATE POLICY "Update own products" ON public.products
  FOR UPDATE USING (
    auth.uid() = user_id
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'revendedor'::app_role))
  );

DROP POLICY IF EXISTS "Delete own products" ON public.products;
CREATE POLICY "Delete own products" ON public.products
  FOR DELETE USING (
    auth.uid() = user_id
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'revendedor'::app_role))
  );

-- BUDGETS
DROP POLICY IF EXISTS "View budgets" ON public.budgets;
CREATE POLICY "View budgets" ON public.budgets
  FOR SELECT USING (owner_user_id(auth.uid()) = user_id);

DROP POLICY IF EXISTS "Update own budgets" ON public.budgets;
CREATE POLICY "Update own budgets" ON public.budgets
  FOR UPDATE USING (owner_user_id(auth.uid()) = user_id);

DROP POLICY IF EXISTS "Delete own budgets" ON public.budgets;
CREATE POLICY "Delete own budgets" ON public.budgets
  FOR DELETE USING (owner_user_id(auth.uid()) = user_id);

-- BUDGET_ITEMS
DROP POLICY IF EXISTS "Users can view own budget_items" ON public.budget_items;
CREATE POLICY "Users can view own budget_items" ON public.budget_items
  FOR SELECT USING (owner_user_id(auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own budget_items" ON public.budget_items;
CREATE POLICY "Users can update own budget_items" ON public.budget_items
  FOR UPDATE USING (owner_user_id(auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own budget_items" ON public.budget_items;
CREATE POLICY "Users can delete own budget_items" ON public.budget_items
  FOR DELETE USING (owner_user_id(auth.uid()) = user_id);

-- ORDERS
DROP POLICY IF EXISTS "View orders" ON public.orders;
CREATE POLICY "View orders" ON public.orders
  FOR SELECT USING (owner_user_id(auth.uid()) = user_id);

DROP POLICY IF EXISTS "Update own orders" ON public.orders;
CREATE POLICY "Update own orders" ON public.orders
  FOR UPDATE USING (owner_user_id(auth.uid()) = user_id);

DROP POLICY IF EXISTS "Delete own orders" ON public.orders;
CREATE POLICY "Delete own orders" ON public.orders
  FOR DELETE USING (owner_user_id(auth.uid()) = user_id);
