CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Never trust parent_user_id from client-supplied signup metadata.
  -- Server-side admin code sets it after creation via the service role.
  INSERT INTO public.profiles (id, full_name, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'username'
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'revendedor');
  RETURN NEW;
END;
$function$;