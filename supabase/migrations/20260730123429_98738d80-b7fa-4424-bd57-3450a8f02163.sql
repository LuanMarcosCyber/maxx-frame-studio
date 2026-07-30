ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS description text;

CREATE OR REPLACE FUNCTION public.log_activity(
  _action text,
  _description text,
  _entity text DEFAULT NULL,
  _entity_id text DEFAULT NULL,
  _internal_user_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid := public.owner_user_id(auth.uid());
  v_op uuid;
  v_id uuid;
BEGIN
  IF v_company IS NULL THEN RETURN NULL; END IF;
  IF _internal_user_id IS NOT NULL THEN
    SELECT id INTO v_op FROM public.operators
     WHERE id = _internal_user_id AND owner_user_id = v_company;
  END IF;
  INSERT INTO public.activity_logs (
    company_id, internal_user_id, actor_user_id, action, description, entity, entity_id, metadata
  ) VALUES (
    v_company, v_op, auth.uid(), _action, _description, _entity, _entity_id,
    COALESCE(_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.log_activity(text, text, text, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_activity(text, text, text, text, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_activity_logs(
  _limit integer DEFAULT 200,
  _offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  action text,
  description text,
  entity text,
  entity_id text,
  user_name text,
  metadata jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid := public.owner_user_id(auth.uid());
BEGIN
  IF v_company IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT l.id, l.created_at, l.action, l.description, l.entity, l.entity_id,
         COALESCE(o.name, 'Sistema') AS user_name, l.metadata
    FROM public.activity_logs l
    LEFT JOIN public.operators o ON o.id = l.internal_user_id
   WHERE l.company_id = v_company
   ORDER BY l.created_at DESC
   LIMIT GREATEST(COALESCE(_limit, 200), 1) OFFSET GREATEST(COALESCE(_offset, 0), 0);
END; $$;

REVOKE ALL ON FUNCTION public.list_activity_logs(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_activity_logs(integer, integer) TO authenticated;