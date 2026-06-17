ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'pessoa_fisica',
  ADD COLUMN IF NOT EXISTS commercial_phone text,
  ADD COLUMN IF NOT EXISTS mobile_phone text;

UPDATE public.clients
SET commercial_phone = COALESCE(commercial_phone, phone),
    mobile_phone = COALESCE(mobile_phone, whatsapp);

ALTER TABLE public.clients
  ADD CONSTRAINT clients_customer_type_check
  CHECK (customer_type IN ('pessoa_fisica', 'pessoa_juridica'));
