-- Revoke anon EXECUTE on SECURITY DEFINER functions that require auth.uid()
REVOKE EXECUTE ON FUNCTION public.get_effective_profile() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_active_company_commercial(jsonb) FROM anon, PUBLIC;

-- Harden operators_insert: no longer rely on the stubbed is_collaborator().
-- Only the active company's owner (root profile, no parent) may insert operator rows,
-- and only scoped to their own owner_user_id.
DROP POLICY IF EXISTS operators_insert ON public.operators;
CREATE POLICY operators_insert ON public.operators
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_user_id = public.owner_user_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.parent_user_id IS NULL
        AND p.active = true
    )
  );