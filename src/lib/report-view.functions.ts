import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  budget_id: z.string().uuid().nullable().optional(),
  order_id: z.string().uuid().nullable().optional(),
});

const BUDGET_COLUMNS =
  "id, number, client_name, client_id, total_value, status, created_at, data_vencimento, details, user_id, created_by";

/**
 * Leitura somente-consulta de um orçamento/pedido para o Administrador Global.
 * Usado exclusivamente pelos relatórios de Vendas e Orçamentos (ícone de olho),
 * permitindo auditar documentos de outras empresas sem trocar de conta.
 * Nunca escreve nada; exige papel `admin`.
 */
export const getAdminDocumentView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: adminRow } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (adminRow !== true) throw new Error("Acesso restrito ao Administrador Global.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let budgetId = data.budget_id ?? null;
    let orderNumber: string | null = null;

    if (data.order_id) {
      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("number, budget_id")
        .eq("id", data.order_id)
        .maybeSingle();
      const row = order as { number: string; budget_id: string | null } | null;
      if (row) {
        orderNumber = row.number;
        budgetId = budgetId ?? row.budget_id;
      }
    }

    if (!budgetId) return { budget: null, items: [], orderNumber };

    const { data: budget } = await supabaseAdmin
      .from("budgets")
      .select(BUDGET_COLUMNS)
      .eq("id", budgetId)
      .maybeSingle();

    const { data: items } = await supabaseAdmin
      .from("budget_items")
      .select("id, position, subtotal, data")
      .eq("budget_id", budgetId)
      .order("position", { ascending: true });

    if (!orderNumber) {
      const { data: linked } = await supabaseAdmin
        .from("orders")
        .select("number")
        .eq("budget_id", budgetId)
        .maybeSingle();
      orderNumber = (linked as { number: string } | null)?.number ?? null;
    }

    return { budget: budget ?? null, items: items ?? [], orderNumber };
  });
