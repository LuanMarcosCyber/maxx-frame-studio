
-- 1. Allow parent reseller/admin to view their collaborators' profiles
CREATE POLICY "Parent views collaborator profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (parent_user_id = auth.uid());

-- Allow parent to update collaborator profiles (for permissions management)
CREATE POLICY "Parent updates collaborator profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (parent_user_id = auth.uid());

-- 2. Permission columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_edit_budgets boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_create_products boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_create_clients boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_delete_orders boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_discount_percent numeric(5,2) NOT NULL DEFAULT 100;

-- 3. Discount approval requests
CREATE TABLE IF NOT EXISTS public.discount_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  budget_id uuid REFERENCES public.budgets(id) ON DELETE CASCADE,
  budget_number text,
  requested_percent numeric(5,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_approval_requests TO authenticated;
GRANT ALL ON public.discount_approval_requests TO service_role;

ALTER TABLE public.discount_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or requester views requests"
ON public.discount_approval_requests
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid() OR requested_by = auth.uid());

CREATE POLICY "Collaborator inserts own request"
ON public.discount_approval_requests
FOR INSERT
TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND owner_user_id = public.owner_user_id(auth.uid())
);

CREATE POLICY "Owner updates requests"
ON public.discount_approval_requests
FOR UPDATE
TO authenticated
USING (owner_user_id = auth.uid());

CREATE POLICY "Owner deletes requests"
ON public.discount_approval_requests
FOR DELETE
TO authenticated
USING (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS discount_requests_owner_status_idx
  ON public.discount_approval_requests(owner_user_id, status);
CREATE INDEX IF NOT EXISTS discount_requests_requester_idx
  ON public.discount_approval_requests(requested_by);

CREATE TRIGGER discount_requests_updated_at
BEFORE UPDATE ON public.discount_approval_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
