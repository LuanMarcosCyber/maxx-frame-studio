
-- RPC para atualizar/remover a foto da empresa ativa (respeitando active_company_id / parent).
-- Necessário porque RLS restringe UPDATE ao próprio profile, mas ao trocar de empresa
-- o usuário precisa gravar a foto no profile da empresa ativa.
CREATE OR REPLACE FUNCTION public.set_active_company_avatar(_avatar text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner  uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_owner := public.owner_user_id(v_caller);
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Contas operacionais (filhas) não podem editar a foto da empresa
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller AND parent_user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Contas operacionais não podem alterar a foto da empresa';
  END IF;

  UPDATE public.profiles
     SET avatar_url = _avatar,
         updated_at = now()
   WHERE id = v_owner;

  RETURN v_owner::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_active_company_avatar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_company_avatar(text) TO authenticated;
