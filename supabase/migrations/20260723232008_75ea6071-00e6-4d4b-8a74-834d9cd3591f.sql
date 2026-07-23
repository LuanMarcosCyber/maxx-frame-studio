
-- 1) Stock column on products (all rows; only used for produtos_diversos)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0;
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_stock_quantity_nonneg;
ALTER TABLE public.products
  ADD CONSTRAINT products_stock_quantity_nonneg CHECK (stock_quantity >= 0);

-- 2) Track stock processing on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_processed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_snapshot jsonb;

-- 3) Stock movements history table
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  user_id uuid,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type text NOT NULL,
  quantity integer NOT NULL,
  previous_stock integer NOT NULL,
  new_stock integer NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company reads stock movements" ON public.stock_movements;
CREATE POLICY "Company reads stock movements"
  ON public.stock_movements FOR SELECT TO authenticated
  USING (owner_user_id = public.owner_user_id(auth.uid()));

CREATE INDEX IF NOT EXISTS stock_movements_owner_created_idx
  ON public.stock_movements(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx
  ON public.stock_movements(product_id);

-- 4) Trigger to log manual/initial stock changes on products
CREATE OR REPLACE FUNCTION public.log_product_stock_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller uuid := auth.uid(); v_skip text;
BEGIN
  IF NEW.category IS DISTINCT FROM 'produtos_diversos' THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_skip := current_setting('app.skip_stock_log', true);
  EXCEPTION WHEN OTHERS THEN v_skip := NULL;
  END;
  IF v_skip = 'on' THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.stock_quantity > 0 THEN
      INSERT INTO public.stock_movements
        (owner_user_id, user_id, product_id, movement_type, quantity, previous_stock, new_stock)
      VALUES
        (NEW.user_id, v_caller, NEW.id, 'initial', NEW.stock_quantity, 0, NEW.stock_quantity);
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity THEN
    INSERT INTO public.stock_movements
      (owner_user_id, user_id, product_id, movement_type, quantity, previous_stock, new_stock)
    VALUES
      (NEW.user_id, v_caller, NEW.id, 'manual',
       ABS(NEW.stock_quantity - OLD.stock_quantity), OLD.stock_quantity, NEW.stock_quantity);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_product_stock_change ON public.products;
CREATE TRIGGER trg_log_product_stock_change
  AFTER INSERT OR UPDATE OF stock_quantity ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_product_stock_change();

-- 5) apply_order_stock: idempotent stock deduction for an order
CREATE OR REPLACE FUNCTION public.apply_order_stock(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_order public.orders%ROWTYPE;
  v_snapshot jsonb := '{}'::jsonb;
  v_deficits jsonb := '[]'::jsonb;
  v_pid uuid; v_need int; v_prev int; v_new int;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_owner := public.owner_user_id(v_caller);
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF v_order.user_id <> v_owner THEN RAISE EXCEPTION 'Pedido de outra empresa'; END IF;
  IF v_order.stock_processed THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'snapshot', COALESCE(v_order.stock_snapshot, '{}'::jsonb));
  END IF;

  IF v_order.budget_id IS NOT NULL THEN
    WITH raw AS (
      SELECT data FROM public.budget_items WHERE budget_id = v_order.budget_id
    ),
    extracted AS (
      SELECT (elem->>'productId')::uuid AS pid,
        COALESCE(NULLIF(elem->>'quantidade','')::numeric, 0)
          * COALESCE(NULLIF(r.data->>'quantidade','')::numeric, 1) AS q
      FROM raw r
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.data->'produtosDiversos', '[]'::jsonb)) elem
      WHERE COALESCE(elem->>'productId','') <> ''
    ),
    agg AS (
      SELECT pid, SUM(q)::int AS q FROM extracted GROUP BY pid HAVING SUM(q) > 0
    )
    SELECT COALESCE(jsonb_object_agg(pid::text, q), '{}'::jsonb) INTO v_snapshot FROM agg;
  END IF;

  -- Validate with row locks
  FOR v_pid, v_need IN SELECT (key)::uuid, value::int FROM jsonb_each_text(v_snapshot) LOOP
    SELECT stock_quantity INTO v_prev FROM public.products
      WHERE id = v_pid AND category = 'produtos_diversos' AND user_id = v_owner
      FOR UPDATE;
    IF v_prev IS NULL THEN
      -- product missing or not Diversos in this company: skip silently
      CONTINUE;
    END IF;
    IF v_need > v_prev THEN
      v_deficits := v_deficits || jsonb_build_object(
        'product_id', v_pid, 'requested', v_need, 'available', v_prev);
    END IF;
  END LOOP;

  IF jsonb_array_length(v_deficits) > 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_deficits::text;
  END IF;

  -- Apply deductions
  PERFORM set_config('app.skip_stock_log', 'on', true);
  FOR v_pid, v_need IN SELECT (key)::uuid, value::int FROM jsonb_each_text(v_snapshot) LOOP
    SELECT stock_quantity INTO v_prev FROM public.products
      WHERE id = v_pid AND category = 'produtos_diversos' AND user_id = v_owner;
    IF v_prev IS NULL THEN CONTINUE; END IF;
    v_new := v_prev - v_need;
    UPDATE public.products
       SET stock_quantity = v_new, updated_at = now()
     WHERE id = v_pid;
    INSERT INTO public.stock_movements
      (owner_user_id, user_id, product_id, movement_type, quantity,
       previous_stock, new_stock, order_id)
    VALUES (v_owner, v_caller, v_pid, 'order_out', v_need, v_prev, v_new, _order_id);
  END LOOP;
  PERFORM set_config('app.skip_stock_log', 'off', true);

  UPDATE public.orders
     SET stock_processed = true, stock_snapshot = v_snapshot
   WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'snapshot', v_snapshot);
END;
$$;

-- 6) revert_order_stock: return stock previously deducted for an order
CREATE OR REPLACE FUNCTION public.revert_order_stock(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_order public.orders%ROWTYPE;
  v_pid uuid; v_qty int; v_prev int; v_new int;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_owner := public.owner_user_id(v_caller);
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'missing', true); END IF;
  IF v_order.user_id <> v_owner THEN RAISE EXCEPTION 'Pedido de outra empresa'; END IF;
  IF NOT v_order.stock_processed OR v_order.stock_snapshot IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  PERFORM set_config('app.skip_stock_log', 'on', true);
  FOR v_pid, v_qty IN SELECT (key)::uuid, value::int FROM jsonb_each_text(v_order.stock_snapshot) LOOP
    SELECT stock_quantity INTO v_prev FROM public.products WHERE id = v_pid FOR UPDATE;
    IF v_prev IS NULL THEN CONTINUE; END IF;
    v_new := v_prev + v_qty;
    UPDATE public.products SET stock_quantity = v_new, updated_at = now() WHERE id = v_pid;
    INSERT INTO public.stock_movements
      (owner_user_id, user_id, product_id, movement_type, quantity,
       previous_stock, new_stock, order_id)
    VALUES (v_owner, v_caller, v_pid, 'order_return', v_qty, v_prev, v_new, _order_id);
  END LOOP;
  PERFORM set_config('app.skip_stock_log', 'off', true);

  UPDATE public.orders SET stock_processed = false, stock_snapshot = NULL WHERE id = _order_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Restrict execution to authenticated (SECURITY DEFINER)
REVOKE ALL ON FUNCTION public.apply_order_stock(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revert_order_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_order_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_order_stock(uuid) TO authenticated;
