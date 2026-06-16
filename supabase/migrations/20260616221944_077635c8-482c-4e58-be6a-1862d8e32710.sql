ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS supplier text;