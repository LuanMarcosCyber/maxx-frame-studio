-- Column-level REVOKE has no effect against a table-level GRANT; re-issue as column grants.
REVOKE UPDATE, INSERT ON public.operators FROM authenticated, anon;
GRANT INSERT (
  id, owner_user_id, operational_account_id, name, nickname, active,
  can_delete_orders, max_discount_percent, created_at, updated_at,
  is_global_admin, failed_pin_attempts, locked_until,
  can_access_reports, can_access_history, can_manage_registrations,
  reg_clients, reg_products, reg_suppliers, reg_architects, reg_carriers, is_owner
) ON public.operators TO authenticated;
GRANT UPDATE (
  owner_user_id, operational_account_id, name, nickname, active,
  can_delete_orders, max_discount_percent, updated_at,
  is_global_admin, failed_pin_attempts, locked_until,
  can_access_reports, can_access_history, can_manage_registrations,
  reg_clients, reg_products, reg_suppliers, reg_architects, reg_carriers, is_owner
) ON public.operators TO authenticated;

REVOKE SELECT, INSERT, UPDATE ON public.profiles FROM authenticated, anon;
GRANT SELECT (
  id, full_name, phone, created_at, updated_at, username, email, document,
  address, parent_user_id, active, avatar_url, store_name, can_edit_budgets,
  can_create_products, can_create_clients, can_delete_orders,
  max_discount_percent, account_type, cep, address_number, city, state,
  document_type, company_group_id, active_company_id, legal_name,
  state_registration, whatsapp, complement, neighborhood
) ON public.profiles TO authenticated;
GRANT INSERT (
  id, full_name, phone, created_at, updated_at, username, email, document,
  address, parent_user_id, active, avatar_url, store_name, can_edit_budgets,
  can_create_products, can_create_clients, can_delete_orders,
  max_discount_percent, account_type, cep, address_number, city, state,
  document_type, company_group_id, active_company_id, legal_name,
  state_registration, whatsapp, complement, neighborhood
) ON public.profiles TO authenticated;
GRANT UPDATE (
  full_name, phone, updated_at, username, email, document,
  address, parent_user_id, active, avatar_url, store_name, can_edit_budgets,
  can_create_products, can_create_clients, can_delete_orders,
  max_discount_percent, account_type, cep, address_number, city, state,
  document_type, company_group_id, active_company_id, legal_name,
  state_registration, whatsapp, complement, neighborhood
) ON public.profiles TO authenticated;

GRANT ALL ON public.operators TO service_role;
GRANT ALL ON public.profiles TO service_role;