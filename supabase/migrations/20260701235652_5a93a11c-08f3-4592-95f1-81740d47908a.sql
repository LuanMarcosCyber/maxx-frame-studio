
CREATE TABLE public.carriers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX carriers_user_id_idx ON public.carriers(user_id);
CREATE INDEX carriers_name_idx ON public.carriers(lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carriers TO authenticated;
GRANT ALL ON public.carriers TO service_role;

ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View carriers" ON public.carriers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR user_id = COALESCE(public.owner_user_id(auth.uid()), auth.uid()));

CREATE POLICY "Insert carriers" ON public.carriers FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR user_id = COALESCE(public.owner_user_id(auth.uid()), auth.uid()));

CREATE POLICY "Update carriers" ON public.carriers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR user_id = COALESCE(public.owner_user_id(auth.uid()), auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR user_id = COALESCE(public.owner_user_id(auth.uid()), auth.uid()));

CREATE POLICY "Delete carriers" ON public.carriers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR user_id = COALESCE(public.owner_user_id(auth.uid()), auth.uid()));

CREATE TRIGGER update_carriers_updated_at BEFORE UPDATE ON public.carriers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
