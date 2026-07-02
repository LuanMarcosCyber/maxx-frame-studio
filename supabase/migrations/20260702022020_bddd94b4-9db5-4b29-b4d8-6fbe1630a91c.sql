
-- Defense-in-depth: revoke client access to sensitive columns.
-- All legitimate reads/writes happen via server functions using service_role (bypasses column ACLs).

-- 1) Hide operator PIN hashes from client roles
REVOKE SELECT (pin_hash) ON public.operators FROM authenticated;
REVOKE SELECT (pin_hash) ON public.operators FROM anon;
REVOKE UPDATE (pin_hash) ON public.operators FROM authenticated;
REVOKE UPDATE (pin_hash) ON public.operators FROM anon;
REVOKE INSERT (pin_hash) ON public.operators FROM authenticated;
REVOKE INSERT (pin_hash) ON public.operators FROM anon;

-- 2) Hide legacy profile PIN hash from client roles
REVOKE SELECT (pin_hash) ON public.profiles FROM authenticated;
REVOKE SELECT (pin_hash) ON public.profiles FROM anon;
REVOKE UPDATE (pin_hash) ON public.profiles FROM authenticated;
REVOKE UPDATE (pin_hash) ON public.profiles FROM anon;
REVOKE INSERT (pin_hash) ON public.profiles FROM authenticated;
REVOKE INSERT (pin_hash) ON public.profiles FROM anon;

-- 3) Prevent client-side privilege escalation on profiles at the column-privilege layer,
--    in addition to the existing prevent_profile_privilege_escalation trigger.
REVOKE UPDATE (
  parent_user_id,
  active,
  can_edit_budgets,
  can_create_products,
  can_create_clients,
  can_delete_orders,
  max_discount_percent
) ON public.profiles FROM authenticated;
REVOKE UPDATE (
  parent_user_id,
  active,
  can_edit_budgets,
  can_create_products,
  can_create_clients,
  can_delete_orders,
  max_discount_percent
) ON public.profiles FROM anon;
