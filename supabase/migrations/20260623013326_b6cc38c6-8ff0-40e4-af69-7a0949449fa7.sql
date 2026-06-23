
-- 1) is_collaborator must ignore deactivated profiles
CREATE OR REPLACE FUNCTION public.is_collaborator(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND parent_user_id IS NOT NULL
      AND active = true
  )
$$;

-- 2) Revoke anon EXECUTE on SECURITY DEFINER functions exposed to PUBLIC
REVOKE EXECUTE ON FUNCTION public.is_collaborator(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_document_number(text) FROM PUBLIC, anon;

-- 3) Re-scope budgets / orders / budget_items policies to authenticated only
-- BUDGETS
DROP POLICY IF EXISTS "View budgets" ON public.budgets;
CREATE POLICY "View budgets" ON public.budgets
FOR SELECT TO authenticated
USING (
  owner_user_id(auth.uid()) = user_id
  AND (NOT public.is_collaborator(auth.uid()) OR created_by = auth.uid())
);

DROP POLICY IF EXISTS "Insert own budgets" ON public.budgets;
CREATE POLICY "Insert own budgets" ON public.budgets
FOR INSERT TO authenticated
WITH CHECK (user_id = owner_user_id(auth.uid()));

DROP POLICY IF EXISTS "Update own budgets" ON public.budgets;
CREATE POLICY "Update own budgets" ON public.budgets
FOR UPDATE TO authenticated
USING (
  owner_user_id(auth.uid()) = user_id
  AND (NOT public.is_collaborator(auth.uid()) OR created_by = auth.uid())
);

DROP POLICY IF EXISTS "Delete own budgets" ON public.budgets;
CREATE POLICY "Delete own budgets" ON public.budgets
FOR DELETE TO authenticated
USING (
  owner_user_id(auth.uid()) = user_id
  AND (NOT public.is_collaborator(auth.uid()) OR created_by = auth.uid())
);

-- ORDERS
DROP POLICY IF EXISTS "View orders" ON public.orders;
CREATE POLICY "View orders" ON public.orders
FOR SELECT TO authenticated
USING (
  owner_user_id(auth.uid()) = user_id
  AND (NOT public.is_collaborator(auth.uid()) OR created_by = auth.uid())
);

DROP POLICY IF EXISTS "Insert own orders" ON public.orders;
CREATE POLICY "Insert own orders" ON public.orders
FOR INSERT TO authenticated
WITH CHECK (user_id = owner_user_id(auth.uid()));

DROP POLICY IF EXISTS "Update own orders" ON public.orders;
CREATE POLICY "Update own orders" ON public.orders
FOR UPDATE TO authenticated
USING (
  owner_user_id(auth.uid()) = user_id
  AND (NOT public.is_collaborator(auth.uid()) OR created_by = auth.uid())
);

DROP POLICY IF EXISTS "Delete own orders" ON public.orders;
CREATE POLICY "Delete own orders" ON public.orders
FOR DELETE TO authenticated
USING (
  owner_user_id(auth.uid()) = user_id
  AND (NOT public.is_collaborator(auth.uid()) OR created_by = auth.uid())
);

-- BUDGET_ITEMS
DROP POLICY IF EXISTS "Users can view own budget_items" ON public.budget_items;
CREATE POLICY "Users can view own budget_items" ON public.budget_items
FOR SELECT TO authenticated
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

DROP POLICY IF EXISTS "Users can insert own budget_items" ON public.budget_items;
CREATE POLICY "Users can insert own budget_items" ON public.budget_items
FOR INSERT TO authenticated
WITH CHECK (user_id = owner_user_id(auth.uid()));

DROP POLICY IF EXISTS "Users can update own budget_items" ON public.budget_items;
CREATE POLICY "Users can update own budget_items" ON public.budget_items
FOR UPDATE TO authenticated
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
FOR DELETE TO authenticated
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
