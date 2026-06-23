ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.orders  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_budgets_created_by ON public.budgets(created_by);
CREATE INDEX IF NOT EXISTS idx_orders_created_by  ON public.orders(created_by);