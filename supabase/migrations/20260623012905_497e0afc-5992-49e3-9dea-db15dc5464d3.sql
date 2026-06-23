
-- Helper: is the given user a collaborator (sub-account)?
CREATE OR REPLACE FUNCTION public.is_collaborator(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND parent_user_id IS NOT NULL
  )
$$;

-- BUDGETS: restrict collaborators to rows they themselves created
DROP POLICY IF EXISTS "View budgets" ON public.budgets;
CREATE POLICY "View budgets" ON public.budgets
FOR SELECT
USING (
  owner_user_id(auth.uid()) = user_id
  AND (NOT public.is_collaborator(auth.uid()) OR created_by = auth.uid())
);

DROP POLICY IF EXISTS "Update own budgets" ON public.budgets;
CREATE POLICY "Update own budgets" ON public.budgets
FOR UPDATE
USING (
  owner_user_id(auth.uid()) = user_id
  AND (NOT public.is_collaborator(auth.uid()) OR created_by = auth.uid())
);

DROP POLICY IF EXISTS "Delete own budgets" ON public.budgets;
CREATE POLICY "Delete own budgets" ON public.budgets
FOR DELETE
USING (
  owner_user_id(auth.uid()) = user_id
  AND (NOT public.is_collaborator(auth.uid()) OR created_by = auth.uid())
);

-- ORDERS: same treatment
DROP POLICY IF EXISTS "View orders" ON public.orders;
CREATE POLICY "View orders" ON public.orders
FOR SELECT
USING (
  owner_user_id(auth.uid()) = user_id
  AND (NOT public.is_collaborator(auth.uid()) OR created_by = auth.uid())
);

DROP POLICY IF EXISTS "Update own orders" ON public.orders;
CREATE POLICY "Update own orders" ON public.orders
FOR UPDATE
USING (
  owner_user_id(auth.uid()) = user_id
  AND (NOT public.is_collaborator(auth.uid()) OR created_by = auth.uid())
);

DROP POLICY IF EXISTS "Delete own orders" ON public.orders;
CREATE POLICY "Delete own orders" ON public.orders
FOR DELETE
USING (
  owner_user_id(auth.uid()) = user_id
  AND (NOT public.is_collaborator(auth.uid()) OR created_by = auth.uid())
);

-- BUDGET_ITEMS: restrict by parent budget visibility for collaborators
DROP POLICY IF EXISTS "Users can view own budget_items" ON public.budget_items;
CREATE POLICY "Users can view own budget_items" ON public.budget_items
FOR SELECT
USING (
  owner_user_id(auth.uid()) = user_id
  AND (
    NOT public.is_collaborator(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = budget_items.budget_id AND b.created_by = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Users can update own budget_items" ON public.budget_items;
CREATE POLICY "Users can update own budget_items" ON public.budget_items
FOR UPDATE
USING (
  owner_user_id(auth.uid()) = user_id
  AND (
    NOT public.is_collaborator(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = budget_items.budget_id AND b.created_by = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Users can delete own budget_items" ON public.budget_items;
CREATE POLICY "Users can delete own budget_items" ON public.budget_items
FOR DELETE
USING (
  owner_user_id(auth.uid()) = user_id
  AND (
    NOT public.is_collaborator(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = budget_items.budget_id AND b.created_by = auth.uid()
    )
  )
);
