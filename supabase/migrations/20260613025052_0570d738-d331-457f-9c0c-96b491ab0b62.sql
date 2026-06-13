
-- 1. Harden handle_new_user: never trust client-supplied role metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent uuid;
BEGIN
  v_parent := NULLIF(NEW.raw_user_meta_data->>'parent_user_id', '')::uuid;

  INSERT INTO public.profiles (id, full_name, username, parent_user_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'username',
    v_parent
  );

  -- Always default to the least-privileged role; admins promote afterwards
  -- via the server-side admin functions using the service role key.
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'revendedor');
  RETURN NEW;
END;
$function$;

-- 2. Inactive users lose owner scope: owner_user_id() returns NULL for them,
--    which makes every owner_user_id()-based RLS policy deny access.
CREATE OR REPLACE FUNCTION public.owner_user_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN NULL
    WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND active = true) THEN NULL
    ELSE COALESCE(
      (SELECT parent_user_id FROM public.profiles WHERE id = _user_id AND parent_user_id IS NOT NULL),
      _user_id
    )
  END
$function$;
