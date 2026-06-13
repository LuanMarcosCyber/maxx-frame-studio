
-- Restrict policies to authenticated role only
DROP POLICY IF EXISTS "Users can update own budget_items" ON public.budget_items;
DROP POLICY IF EXISTS "Users can delete own budget_items" ON public.budget_items;
DROP POLICY IF EXISTS "Users can view own budget_items" ON public.budget_items;
DROP POLICY IF EXISTS "View products" ON public.products;
DROP POLICY IF EXISTS "Update own products" ON public.products;
DROP POLICY IF EXISTS "Delete own products" ON public.products;
DROP POLICY IF EXISTS "View budgets" ON public.budgets;
DROP POLICY IF EXISTS "Update own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Delete own budgets" ON public.budgets;
DROP POLICY IF EXISTS "View orders" ON public.orders;
DROP POLICY IF EXISTS "Update own orders" ON public.orders;
DROP POLICY IF EXISTS "Delete own orders" ON public.orders;

CREATE POLICY "Users can view own budget_items" ON public.budget_items
  FOR SELECT TO authenticated USING (owner_user_id(auth.uid()) = user_id);
CREATE POLICY "Users can update own budget_items" ON public.budget_items
  FOR UPDATE TO authenticated USING (owner_user_id(auth.uid()) = user_id);
CREATE POLICY "Users can delete own budget_items" ON public.budget_items
  FOR DELETE TO authenticated USING (owner_user_id(auth.uid()) = user_id);

CREATE POLICY "View products" ON public.products
  FOR SELECT TO authenticated USING (owner_user_id(auth.uid()) = user_id);
CREATE POLICY "Update own products" ON public.products
  FOR UPDATE TO authenticated USING ((auth.uid() = user_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'revendedor'::app_role)));
CREATE POLICY "Delete own products" ON public.products
  FOR DELETE TO authenticated USING ((auth.uid() = user_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'revendedor'::app_role)));

CREATE POLICY "View budgets" ON public.budgets
  FOR SELECT TO authenticated USING (owner_user_id(auth.uid()) = user_id);
CREATE POLICY "Update own budgets" ON public.budgets
  FOR UPDATE TO authenticated USING (owner_user_id(auth.uid()) = user_id);
CREATE POLICY "Delete own budgets" ON public.budgets
  FOR DELETE TO authenticated USING (owner_user_id(auth.uid()) = user_id);

CREATE POLICY "View orders" ON public.orders
  FOR SELECT TO authenticated USING (owner_user_id(auth.uid()) = user_id);
CREATE POLICY "Update own orders" ON public.orders
  FOR UPDATE TO authenticated USING (owner_user_id(auth.uid()) = user_id);
CREATE POLICY "Delete own orders" ON public.orders
  FOR DELETE TO authenticated USING (owner_user_id(auth.uid()) = user_id);

-- Revoke EXECUTE on SECURITY DEFINER helper functions from anon/public
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owner_user_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_user_id(uuid) TO authenticated, service_role;
