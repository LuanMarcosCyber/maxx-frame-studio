import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertOperatorPermission,
  operatorDiscountLimit,
  currentOperator,
} from "@/lib/operator-guard.server";

/**
 * Exclusão de pedido validada no servidor.
 * A permissão "Excluir pedidos" do usuário interno ativo é conferida a partir
 * do token assinado — o cliente não consegue burlar pela UI.
 * A propriedade do registro continua garantida pelo RLS (client do usuário).
 */
export const deleteOrderSecure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) =>
    z.object({ orderId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOperatorPermission("delete_orders");

    const { error: revertError } = await context.supabase.rpc("revert_order_stock", {
      _order_id: data.orderId,
    });
    if (revertError) {
      throw new Error("Não foi possível devolver o estoque antes da exclusão.");
    }

    const { error } = await context.supabase.from("orders").delete().eq("id", data.orderId);
    if (error) {
      throw new Error("Não foi possível excluir o pedido.");
    }
    return { ok: true };
  });

/**
 * Valida no servidor se o desconto informado está dentro do limite do usuário
 * interno ativo (ou de uma autorização aprovada para o orçamento).
 */
export const assertDiscountAllowed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { percent: number; budgetId?: string | null }) =>
    z
      .object({ percent: z.number().min(0).max(100), budgetId: z.string().uuid().nullish() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const percent = data.percent;
    if (percent <= 0) return { allowed: true as const };

    const op = await currentOperator();
    // Sem usuário interno ativo, o limite da própria conta é aplicado pelo banco.
    const limit = op ? await operatorDiscountLimit() : 100;
    if (percent <= limit + 0.001) return { allowed: true as const };

    if (data.budgetId) {
      const { data: req } = await context.supabase
        .from("discount_approval_requests")
        .select("requested_percent")
        .eq("budget_id", data.budgetId)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const approved = req ? Number(req.requested_percent) : null;
      if (approved !== null && percent <= approved + 0.001) {
        return { allowed: true as const };
      }
    }

    return { allowed: false as const, limit };
  });
