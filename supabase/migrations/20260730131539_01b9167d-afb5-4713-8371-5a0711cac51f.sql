ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS can_access_reports boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_history boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_registrations boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reg_clients boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reg_products boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reg_suppliers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reg_architects boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reg_carriers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

-- Marca como proprietário os usuários já cadastrados com a função "Proprietário"
UPDATE public.operators
SET is_owner = true
WHERE lower(coalesce(nickname, '')) IN ('proprietário', 'proprietario');

-- Proprietários têm acesso total
UPDATE public.operators
SET can_access_reports = true,
    can_access_history = true,
    can_manage_registrations = true,
    reg_clients = true,
    reg_products = true,
    reg_suppliers = true,
    reg_architects = true,
    reg_carriers = true,
    can_delete_orders = true
WHERE is_owner = true;

-- Funcionários existentes: migra as permissões antigas de cadastro
UPDATE public.operators
SET reg_clients = coalesce(can_create_clients, false),
    reg_products = coalesce(can_create_products, false),
    can_manage_registrations = (coalesce(can_create_clients, false) OR coalesce(can_create_products, false))
WHERE is_owner = false;

-- Permissão "Editar orçamentos" deixa de existir
ALTER TABLE public.operators DROP COLUMN IF EXISTS can_edit_budgets;
ALTER TABLE public.operators DROP COLUMN IF EXISTS can_create_products;
ALTER TABLE public.operators DROP COLUMN IF EXISTS can_create_clients;