-- Definitive access-account inheritance fix.
-- Access accounts must have a clear parent link. Existing TOTAL MAXX COLABORADORES is linked to Evandro.

UPDATE public.profiles AS child
SET
  parent_user_id = parent.id,
  account_type = 'operacional'::public.account_type,
  updated_at = now()
FROM public.profiles AS parent
WHERE upper(coalesce(child.full_name, '')) = 'TOTAL MAXX COLABORADORES'
  AND (
    upper(coalesce(parent.full_name, '')) = 'EVANDRO'
    OR lower(coalesce(parent.username, '')) = 'admin'
    OR lower(coalesce(parent.email, '')) = 'financeiro@totalmaxx.com.br'
  )
  AND child.id <> parent.id;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
  v_parent uuid;
BEGIN
  v_parent := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'parent_user_id', '')::uuid,
    NULLIF(NEW.raw_user_meta_data->>'owner_user_id', '')::uuid,
    NULLIF(NEW.raw_user_meta_data->>'created_by', '')::uuid
  );

  INSERT INTO public.profiles (id, full_name, username, parent_user_id, account_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'username',
    v_parent,
    CASE WHEN v_parent IS NOT NULL THEN 'operacional'::public.account_type ELSE NULL END
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    username = EXCLUDED.username,
    parent_user_id = COALESCE(public.profiles.parent_user_id, EXCLUDED.parent_user_id),
    account_type = COALESCE(public.profiles.account_type, EXCLUDED.account_type);

  v_role := CASE
    WHEN v_parent IS NOT NULL THEN 'colaborador'::public.app_role
    ELSE COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', '')::public.app_role, 'revendedor'::public.app_role)
  END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.owner_user_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT parent_user_id FROM public.profiles WHERE id = _user_id AND active = true AND parent_user_id IS NOT NULL),
    _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.next_document_number_for(_caller uuid, _kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_next bigint;
  v_prefix text;
BEGIN
  v_owner := public.owner_user_id(_caller);
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _kind = 'budget' THEN
    v_prefix := 'ORC';
  ELSIF _kind = 'order' THEN
    v_prefix := 'PED';
  ELSE
    RAISE EXCEPTION 'Invalid kind: %', _kind;
  END IF;

  INSERT INTO public.number_counters (owner_user_id, kind, last_value)
  VALUES (v_owner, _kind, 0)
  ON CONFLICT (owner_user_id, kind) DO NOTHING;

  PERFORM 1 FROM public.number_counters
    WHERE owner_user_id = v_owner AND kind = _kind
    FOR UPDATE;

  SELECT last_value INTO v_next FROM public.number_counters
    WHERE owner_user_id = v_owner AND kind = _kind;

  v_next := v_next + 1;

  UPDATE public.number_counters
    SET last_value = v_next, updated_at = now()
    WHERE owner_user_id = v_owner AND kind = _kind;

  RETURN v_prefix || '-' || lpad(v_next::text, 6, '0');
END;
$$;

-- RLS policies still depend on has_role/owner_user_id/is_collaborator for authenticated users.
-- Keep those grants, but close direct document-number generation and trigger functions.
REVOKE EXECUTE ON FUNCTION public.next_document_number(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_document_number_for(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_user_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_collaborator(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_document_number(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_document_number_for(uuid, text) TO service_role;
