CREATE OR REPLACE FUNCTION public.natural_key(_s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT string_agg(
    CASE WHEN part ~ '^\d+$' THEN lpad(part, 20, '0') ELSE lower(part) END,
    '' ORDER BY ord
  )
  FROM regexp_split_to_table(COALESCE(_s,''), '(?<=\D)(?=\d)|(?<=\d)(?=\D)')
       WITH ORDINALITY AS t(part, ord);
$function$;