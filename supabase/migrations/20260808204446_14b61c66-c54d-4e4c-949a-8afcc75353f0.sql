
CREATE OR REPLACE FUNCTION public.caller_can_delete_orders()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN p.parent_user_id IS NULL THEN true ELSE p.can_delete_orders END
       FROM public.profiles p WHERE p.id = auth.uid()),
    false)
$$;

REVOKE EXECUTE ON FUNCTION public.caller_can_delete_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_can_delete_orders() TO authenticated, service_role;

DROP POLICY IF EXISTS "Delete own orders" ON public.orders;
CREATE POLICY "Delete own orders" ON public.orders
FOR DELETE TO authenticated
USING (owner_user_id(auth.uid()) = user_id AND public.caller_can_delete_orders());

CREATE OR REPLACE FUNCTION public.caller_max_discount_percent()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN p.parent_user_id IS NULL THEN 100
                 ELSE COALESCE(p.max_discount_percent, 0) END
       FROM public.profiles p WHERE p.id = auth.uid()),
    0)
$$;

REVOKE EXECUTE ON FUNCTION public.caller_max_discount_percent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_max_discount_percent() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_budget_discount_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pct numeric;
  _limit numeric;
  _approved numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    _pct := COALESCE((NEW.details ->> 'descontoPercentual')::numeric, 0);
  EXCEPTION WHEN others THEN
    _pct := 0;
  END;

  IF _pct <= 0 THEN
    RETURN NEW;
  END IF;

  _limit := public.caller_max_discount_percent();
  IF _pct <= _limit + 0.001 THEN
    RETURN NEW;
  END IF;

  SELECT MAX(r.requested_percent) INTO _approved
  FROM public.discount_approval_requests r
  WHERE r.budget_id = NEW.id AND r.status = 'approved';

  IF _approved IS NOT NULL AND _pct <= _approved + 0.001 THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'DISCOUNT_LIMIT_EXCEEDED: desconto acima do limite autorizado (%)', _pct;
END;
$$;

DROP TRIGGER IF EXISTS enforce_budget_discount_limit_trg ON public.budgets;
CREATE TRIGGER enforce_budget_discount_limit_trg
BEFORE INSERT OR UPDATE ON public.budgets
FOR EACH ROW EXECUTE FUNCTION public.enforce_budget_discount_limit();
