
-- 1) is_collaborator sempre false (mantém a função para compatibilidade)
CREATE OR REPLACE FUNCTION public.is_collaborator(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT false $$;

-- 2) owner_user_id ignora parent_user_id
CREATE OR REPLACE FUNCTION public.owner_user_id(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.profiles%ROWTYPE;
  v_owner uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_row FROM public.profiles WHERE id = _user_id AND active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_owner := v_row.id;

  IF v_row.active_company_id IS NOT NULL
     AND v_row.active_company_id <> v_row.id
     AND public.can_switch_to_company(v_row.id, v_row.active_company_id)
  THEN
    v_owner := v_row.active_company_id;
  END IF;

  RETURN v_owner;
END;
$$;

-- 3) Garante trigger BEFORE INSERT bloqueando novos perfis operacionais
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_block_new_operational_profile'
  ) THEN
    CREATE TRIGGER trg_block_new_operational_profile
    BEFORE INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.block_new_operational_profile();
  END IF;
END $$;
