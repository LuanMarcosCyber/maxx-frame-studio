ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS labor_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_percentage numeric NOT NULL DEFAULT 0;