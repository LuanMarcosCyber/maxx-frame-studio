
-- 1. Trigger fix: allow bypass when running under the service role (auth.uid() IS NULL)
-- so the admin server code can set parent_user_id and permissions during collaborator creation.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Service-role / server-side context (no JWT): allow.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Parent (revendedor) can maintain their own collaborators' privileged fields.
  IF OLD.parent_user_id IS NOT NULL AND OLD.parent_user_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_user_id IS DISTINCT FROM OLD.parent_user_id
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.can_edit_budgets IS DISTINCT FROM OLD.can_edit_budgets
     OR NEW.can_create_products IS DISTINCT FROM OLD.can_create_products
     OR NEW.can_create_clients IS DISTINCT FROM OLD.can_create_clients
     OR NEW.can_delete_orders IS DISTINCT FROM OLD.can_delete_orders
     OR NEW.max_discount_percent IS DISTINCT FROM OLD.max_discount_percent
  THEN
    RAISE EXCEPTION 'Not authorized to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure the trigger exists (it may have been created earlier with the same name).
DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2. PIN storage for collaborators (hashed).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin_hash text;

-- 3. Active operator recorded on budgets and orders.
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS operator_name text;
ALTER TABLE public.orders  ADD COLUMN IF NOT EXISTS operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.orders  ADD COLUMN IF NOT EXISTS operator_name text;
