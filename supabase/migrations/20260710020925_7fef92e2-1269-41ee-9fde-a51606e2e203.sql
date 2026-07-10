
DROP POLICY IF EXISTS "View products" ON public.products;
CREATE POLICY "View products" ON public.products FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR (user_id IN (SELECT company_group_owner_ids(owner_user_id(auth.uid())))));

DROP POLICY IF EXISTS "View clients" ON public.clients;
CREATE POLICY "View clients" ON public.clients FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR (user_id IN (SELECT company_group_owner_ids(owner_user_id(auth.uid())))));

DROP POLICY IF EXISTS "View architects" ON public.architects;
CREATE POLICY "View architects" ON public.architects FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR (user_id IN (SELECT company_group_owner_ids(owner_user_id(auth.uid())))));

DROP POLICY IF EXISTS "View carriers" ON public.carriers;
CREATE POLICY "View carriers" ON public.carriers FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR (user_id IN (SELECT company_group_owner_ids(owner_user_id(auth.uid())))));
