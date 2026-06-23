
CREATE OR REPLACE FUNCTION public.next_document_number(_kind text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_next bigint;
  v_prefix text;
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
$function$;

-- Reset all existing counters so the next document starts at 000001.
UPDATE public.number_counters SET last_value = 0, updated_at = now();
