
-- 1. Colunas novas em operators (usuários internos)
ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS is_global_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS failed_pin_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-- 2. Tabela de logs de atividade
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  internal_user_id uuid REFERENCES public.operators(id) ON DELETE SET NULL,
  actor_user_id uuid,
  action text NOT NULL,
  entity text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_logs_company_idx ON public.activity_logs(company_id, created_at DESC);
GRANT SELECT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_select" ON public.activity_logs;
CREATE POLICY "activity_logs_select" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (
    company_id = public.owner_user_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- 3. Contar usuários internos ativos da empresa ativa
CREATE OR REPLACE FUNCTION public.count_active_internal_users()
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner uuid; v_count integer;
BEGIN
  v_owner := public.owner_user_id(auth.uid());
  IF v_owner IS NULL THEN RETURN 0; END IF;
  SELECT COUNT(*)::int INTO v_count
    FROM public.operators
   WHERE owner_user_id = v_owner AND active = true;
  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.count_active_internal_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_active_internal_users() TO authenticated;

-- 4. Registrar tentativa de PIN (para o front chamar após verificar)
CREATE OR REPLACE FUNCTION public.register_pin_attempt(_operator_id uuid, _success boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := public.owner_user_id(auth.uid());
  v_row public.operators%ROWTYPE;
  v_new_attempts integer;
  v_locked timestamptz;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_row FROM public.operators WHERE id = _operator_id AND owner_user_id = v_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado'; END IF;

  IF _success THEN
    UPDATE public.operators
       SET failed_pin_attempts = 0, locked_until = NULL, updated_at = now()
     WHERE id = _operator_id;
    RETURN jsonb_build_object('ok', true, 'locked', false, 'attempts', 0);
  END IF;

  v_new_attempts := COALESCE(v_row.failed_pin_attempts, 0) + 1;
  v_locked := CASE WHEN v_new_attempts >= 5 THEN now() + interval '10 minutes' ELSE v_row.locked_until END;
  UPDATE public.operators
     SET failed_pin_attempts = v_new_attempts,
         locked_until = v_locked,
         updated_at = now()
   WHERE id = _operator_id;
  RETURN jsonb_build_object('ok', true, 'locked', v_locked IS NOT NULL AND v_locked > now(),
    'locked_until', v_locked, 'attempts', v_new_attempts);
END; $$;

REVOKE ALL ON FUNCTION public.register_pin_attempt(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_pin_attempt(uuid, boolean) TO authenticated;

-- 5. Ver se o usuário logado tem qualquer usuário interno marcado como Admin Global
CREATE OR REPLACE FUNCTION public.is_internal_global_admin(_operator_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.operators
     WHERE id = _operator_id
       AND owner_user_id = public.owner_user_id(auth.uid())
       AND active = true
       AND is_global_admin = true
  );
$$;
REVOKE ALL ON FUNCTION public.is_internal_global_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_internal_global_admin(uuid) TO authenticated;

-- 6. Migração de dados: garantir usuário Evandro (admin global) + Proprietário em toda empresa sem usuário
DO $$
DECLARE
  v_pin_hash text := 'scrypt:b63937fc5b83f99f34daecb22a39bfd6:0c0e056855b201509ed25b230981f31a01a70d170c0cd43e3ec28c7bebd26609';
  v_admin_id uuid;
  v_rec RECORD;
BEGIN
  -- Empresa do Evandro (admin role)
  SELECT ur.user_id INTO v_admin_id
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
   WHERE ur.role = 'admin' AND p.parent_user_id IS NULL
   ORDER BY p.created_at ASC LIMIT 1;

  IF v_admin_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.operators WHERE owner_user_id = v_admin_id AND is_global_admin = true) THEN
      INSERT INTO public.operators (owner_user_id, name, nickname, pin_hash, active,
        can_edit_budgets, can_create_products, can_create_clients, can_delete_orders,
        max_discount_percent, is_global_admin)
      VALUES (v_admin_id,
        COALESCE((SELECT full_name FROM public.profiles WHERE id = v_admin_id), 'Evandro'),
        'evandro', v_pin_hash, true, true, true, true, true, 100, true);
    END IF;
  END IF;

  -- Criar Proprietário para toda empresa (perfil raiz) que não tenha nenhum operator ativo
  FOR v_rec IN
    SELECT p.id, p.full_name, p.store_name
      FROM public.profiles p
     WHERE p.parent_user_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.operators o WHERE o.owner_user_id = p.id AND o.active = true)
  LOOP
    INSERT INTO public.operators (owner_user_id, name, nickname, pin_hash, active,
      can_edit_budgets, can_create_products, can_create_clients, can_delete_orders,
      max_discount_percent, is_global_admin)
    VALUES (v_rec.id,
      COALESCE(NULLIF(btrim(v_rec.full_name), ''), NULLIF(btrim(v_rec.store_name), ''), 'Proprietário'),
      'proprietario', v_pin_hash, true, true, true, true, true, 100, false);
  END LOOP;
END $$;
