CREATE OR REPLACE FUNCTION public.list_switchable_companies()
 RETURNS TABLE(id uuid, full_name text, store_name text, avatar_url text, is_active boolean, is_self boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_row public.profiles%ROWTYPE;
  v_group uuid;
  v_current uuid;
BEGIN
  IF v_caller IS NULL THEN RETURN; END IF;
  SELECT * INTO v_row FROM public.profiles p WHERE p.id = v_caller;
  IF NOT FOUND OR v_row.parent_user_id IS NOT NULL THEN RETURN; END IF;

  v_group := COALESCE(v_row.company_group_id, v_row.id);
  v_current := COALESCE(v_row.active_company_id, v_row.id);

  RETURN QUERY
  SELECT p.id, p.full_name, p.store_name, p.avatar_url,
         (p.id = v_current) AS is_active,
         (p.id = v_caller)  AS is_self
    FROM public.profiles p
   WHERE p.parent_user_id IS NULL
     AND p.active = true
     AND (p.id = v_caller OR COALESCE(p.company_group_id, p.id) = v_group)
   ORDER BY (p.id = v_caller) DESC, p.store_name NULLS LAST, p.full_name;
END;
$function$;