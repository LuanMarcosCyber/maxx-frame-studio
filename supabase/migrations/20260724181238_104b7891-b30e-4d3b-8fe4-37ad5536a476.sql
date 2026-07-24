
-- operators
DROP POLICY IF EXISTS operators_select ON public.operators;
DROP POLICY IF EXISTS operators_update ON public.operators;
DROP POLICY IF EXISTS operators_delete ON public.operators;
CREATE POLICY operators_select ON public.operators FOR SELECT TO authenticated
  USING (owner_user_id = public.owner_user_id(auth.uid()));
CREATE POLICY operators_update ON public.operators FOR UPDATE TO authenticated
  USING (owner_user_id = public.owner_user_id(auth.uid()))
  WITH CHECK (owner_user_id = public.owner_user_id(auth.uid()));
CREATE POLICY operators_delete ON public.operators FOR DELETE TO authenticated
  USING (owner_user_id = public.owner_user_id(auth.uid()));

-- budgets
DROP POLICY IF EXISTS "View budgets" ON public.budgets;
DROP POLICY IF EXISTS "Update own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Delete own budgets" ON public.budgets;
CREATE POLICY "View budgets" ON public.budgets FOR SELECT TO authenticated
  USING (public.owner_user_id(auth.uid()) = user_id);
CREATE POLICY "Update own budgets" ON public.budgets FOR UPDATE TO authenticated
  USING (public.owner_user_id(auth.uid()) = user_id)
  WITH CHECK (public.owner_user_id(auth.uid()) = user_id);
CREATE POLICY "Delete own budgets" ON public.budgets FOR DELETE TO authenticated
  USING (public.owner_user_id(auth.uid()) = user_id);

-- orders
DROP POLICY IF EXISTS "View orders" ON public.orders;
DROP POLICY IF EXISTS "Update own orders" ON public.orders;
DROP POLICY IF EXISTS "Delete own orders" ON public.orders;
CREATE POLICY "View orders" ON public.orders FOR SELECT TO authenticated
  USING (public.owner_user_id(auth.uid()) = user_id);
CREATE POLICY "Update own orders" ON public.orders FOR UPDATE TO authenticated
  USING (public.owner_user_id(auth.uid()) = user_id)
  WITH CHECK (public.owner_user_id(auth.uid()) = user_id);
CREATE POLICY "Delete own orders" ON public.orders FOR DELETE TO authenticated
  USING (public.owner_user_id(auth.uid()) = user_id);

-- budget_items
DROP POLICY IF EXISTS "Users can view own budget_items" ON public.budget_items;
DROP POLICY IF EXISTS "Users can update own budget_items" ON public.budget_items;
DROP POLICY IF EXISTS "Users can delete own budget_items" ON public.budget_items;
CREATE POLICY "Users can view own budget_items" ON public.budget_items FOR SELECT TO authenticated
  USING (public.owner_user_id(auth.uid()) = user_id);
CREATE POLICY "Users can update own budget_items" ON public.budget_items FOR UPDATE TO authenticated
  USING (public.owner_user_id(auth.uid()) = user_id)
  WITH CHECK (public.owner_user_id(auth.uid()) = user_id);
CREATE POLICY "Users can delete own budget_items" ON public.budget_items FOR DELETE TO authenticated
  USING (public.owner_user_id(auth.uid()) = user_id);
