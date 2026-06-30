
-- 1) Architects table
CREATE TABLE public.architects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  document text,
  email text,
  percentage numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX architects_user_id_idx ON public.architects(user_id);
CREATE INDEX architects_name_idx ON public.architects(lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.architects TO authenticated;
GRANT ALL ON public.architects TO service_role;

ALTER TABLE public.architects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View architects" ON public.architects
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR user_id = COALESCE(public.owner_user_id(auth.uid()), auth.uid())
  );

CREATE POLICY "Insert architects" ON public.architects
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR user_id = COALESCE(public.owner_user_id(auth.uid()), auth.uid())
  );

CREATE POLICY "Update architects" ON public.architects
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR user_id = COALESCE(public.owner_user_id(auth.uid()), auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR user_id = COALESCE(public.owner_user_id(auth.uid()), auth.uid())
  );

CREATE POLICY "Delete architects" ON public.architects
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR user_id = COALESCE(public.owner_user_id(auth.uid()), auth.uid())
  );

CREATE TRIGGER update_architects_updated_at
  BEFORE UPDATE ON public.architects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Backfill parent_user_id for collaborators created after the security
--    fix (trigger no longer copies it from signup metadata). The signup
--    metadata still carries it, so we can recover the linkage from there
--    for users whose role is 'colaborador' and parent_user_id is NULL.
UPDATE public.profiles p
SET parent_user_id = (u.raw_user_meta_data->>'parent_user_id')::uuid
FROM auth.users u
WHERE p.id = u.id
  AND p.parent_user_id IS NULL
  AND u.raw_user_meta_data ? 'parent_user_id'
  AND (u.raw_user_meta_data->>'parent_user_id') ~* '^[0-9a-f-]{36}$'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'colaborador'
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles pp
    WHERE pp.id = (u.raw_user_meta_data->>'parent_user_id')::uuid
  );
