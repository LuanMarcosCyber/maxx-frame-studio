
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
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
$$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
