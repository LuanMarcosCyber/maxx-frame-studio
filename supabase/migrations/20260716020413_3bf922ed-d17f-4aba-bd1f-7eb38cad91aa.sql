
ALTER TABLE public._backup_products_pre_global ENABLE ROW LEVEL SECURITY;
-- Sem policies: apenas service_role (backup interno)
REVOKE ALL ON public._backup_products_pre_global FROM PUBLIC, anon, authenticated;
GRANT ALL ON public._backup_products_pre_global TO service_role;
