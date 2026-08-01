REVOKE ALL ON public.operators FROM authenticated, anon;
REVOKE ALL ON public.profiles FROM authenticated, anon;

GRANT SELECT (
  id, owner_user_id, operational_account_id, name, nickname, active,
  can_delete_orders, max_discount_percent, created_at, updated_at,
  is_global_admin, failed_pin_attempts, locked_until,
  can_access_reports, can_access_history, can_manage_registrations,
  reg_clients, reg_products, reg_suppliers, reg_architects, reg_carriers, is_owner
) ON public.operators TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.operators TO authenticated;
REVOKE INSERT (pin_hash), UPDATE (pin_hash) ON public.operators FROM authenticated, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
REVOKE SELECT (pin_hash), INSERT (pin_hash), UPDATE (pin_hash) ON public.profiles FROM authenticated, anon;

GRANT ALL ON public.operators TO service_role;
GRANT ALL ON public.profiles TO service_role;