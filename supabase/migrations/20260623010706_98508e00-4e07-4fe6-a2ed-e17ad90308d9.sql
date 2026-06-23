
-- Sequential numbering for budgets and orders per owner
CREATE TABLE IF NOT EXISTS public.number_counters (
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, kind)
);

GRANT SELECT ON public.number_counters TO authenticated;
GRANT ALL ON public.number_counters TO service_role;

ALTER TABLE public.number_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own counters" ON public.number_counters
  FOR SELECT TO authenticated
  USING (public.owner_user_id(auth.uid()) = owner_user_id);

-- Function: atomically increment and return next formatted number
CREATE OR REPLACE FUNCTION public.next_document_number(_kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_next bigint;
  v_prefix text;
  v_existing_max bigint;
BEGIN
  v_owner := public.owner_user_id(auth.uid());
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

  -- Seed counter from existing max number if first call
  INSERT INTO public.number_counters (owner_user_id, kind, last_value)
  VALUES (v_owner, _kind, 0)
  ON CONFLICT (owner_user_id, kind) DO NOTHING;

  -- Lock the row
  PERFORM 1 FROM public.number_counters
    WHERE owner_user_id = v_owner AND kind = _kind
    FOR UPDATE;

  -- If counter is zero, seed from existing data so we don't reuse numbers
  SELECT last_value INTO v_next FROM public.number_counters
    WHERE owner_user_id = v_owner AND kind = _kind;

  IF v_next = 0 THEN
    IF _kind = 'budget' THEN
      SELECT COALESCE(MAX(
        CASE WHEN number ~ ('^' || v_prefix || '-[0-9]+$')
             THEN (regexp_replace(number, '^' || v_prefix || '-', ''))::bigint
             ELSE 0 END
      ), 0) INTO v_existing_max
      FROM public.budgets WHERE user_id = v_owner;
    ELSE
      SELECT COALESCE(MAX(
        CASE WHEN number ~ ('^' || v_prefix || '-[0-9]+$')
             THEN (regexp_replace(number, '^' || v_prefix || '-', ''))::bigint
             ELSE 0 END
      ), 0) INTO v_existing_max
      FROM public.orders WHERE user_id = v_owner;
    END IF;
    v_next := v_existing_max;
  END IF;

  v_next := v_next + 1;

  UPDATE public.number_counters
    SET last_value = v_next, updated_at = now()
    WHERE owner_user_id = v_owner AND kind = _kind;

  RETURN v_prefix || '-' || lpad(v_next::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_document_number(text) TO authenticated;
