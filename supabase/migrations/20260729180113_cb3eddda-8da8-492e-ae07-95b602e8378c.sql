DROP POLICY IF EXISTS "Owner updates requests" ON public.discount_approval_requests;
CREATE POLICY "Owner updates requests"
ON public.discount_approval_requests
FOR UPDATE
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.prevent_discount_request_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.budget_id IS DISTINCT FROM OLD.budget_id
     OR NEW.requested_percent IS DISTINCT FROM OLD.requested_percent
  THEN
    RAISE EXCEPTION 'Not authorized to modify immutable discount request fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_discount_request_reassignment ON public.discount_approval_requests;
CREATE TRIGGER trg_prevent_discount_request_reassignment
BEFORE UPDATE ON public.discount_approval_requests
FOR EACH ROW EXECUTE FUNCTION public.prevent_discount_request_reassignment();

DROP POLICY IF EXISTS "Parent updates collaborator profiles" ON public.profiles;
CREATE POLICY "Parent updates collaborator profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (parent_user_id = auth.uid())
WITH CHECK (parent_user_id = auth.uid());