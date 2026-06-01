ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS document text,
  ADD COLUMN IF NOT EXISTS address text;