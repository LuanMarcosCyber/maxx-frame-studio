import { useMemo, useState } from "react";
import { Check, X as XIcon, BellRing } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useOperator } from "@/hooks/useOperator";
import { supabase } from "@/integrations/supabase/client";
import { fmtPct } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type DiscountRequest = {
  id: string;
  budget_id: string | null;
  budget_number: string | null;
  requested_percent: number;
  status: string;
  created_at: string;
  requested_by: string;
};

type BudgetInfo = {
  id: string;
  client_name: string | null;
  operator_name: string | null;
};

/**
 * Card exibido logo abaixo do Header para o Proprietário quando existirem
 * solicitações de desconto pendentes. O botão "Fechar" apenas oculta o card
 * na sessão atual; a solicitação permanece pendente e visível no sino.
 */
export function DiscountRequestCard() {
  const { session } = useAuth();
  const { activeOperator } = useOperator();
  const qc = useQueryClient();
  const currentUserId = session?.user?.id ?? null;
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Proprietário = usuário interno com permissão máxima de desconto.
  const isOwnerOperator =
    !!activeOperator && Number(activeOperator.permissions.max_discount_percent) >= 100;

  const { data: requests = [] } = useQuery({
    queryKey: ["discount-requests", "pending", "card", currentUserId],
    enabled: !!currentUserId && isOwnerOperator,
    refetchInterval: 30000,
    queryFn: async (): Promise<DiscountRequest[]> => {
      if (!currentUserId) return [];
      const { data, error } = await supabase
        .from("discount_approval_requests")
        .select(
          "id, budget_id, budget_number, requested_percent, status, created_at, requested_by",
        )
        .eq("status", "pending")
        .eq("owner_user_id", currentUserId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DiscountRequest[];
    },
  });

  const budgetIds = useMemo(
    () => Array.from(new Set(requests.map((r) => r.budget_id).filter(Boolean) as string[])),
    [requests],
  );

  const { data: budgetsMap = new Map<string, BudgetInfo>() } = useQuery({
    queryKey: ["discount-requests", "budgets", budgetIds],
    enabled: budgetIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("budgets")
        .select("id, client_name, operator_name")
        .in("id", budgetIds);
      const m = new Map<string, BudgetInfo>();
      (data ?? []).forEach((b) =>
        m.set(b.id as string, {
          id: b.id as string,
          client_name: (b.client_name as string | null) ?? null,
          operator_name: (b.operator_name as string | null) ?? null,
        }),
      );
      return m;
    },
  });

  const visible = requests.filter((r) => !dismissed.has(r.id));
  if (!isOwnerOperator || visible.length === 0) return null;

  async function decide(req: DiscountRequest, status: "approved" | "rejected") {
    try {
      if (status === "approved" && req.budget_id) {
        const { data: b, error: bErr } = await supabase
          .from("budgets")
          .select("id, details, total_value")
          .eq("id", req.budget_id)
          .maybeSingle();
        if (bErr) throw bErr;
        if (b) {
          const details = { ...((b.details as Record<string, unknown> | null) ?? {}) };
          const subtotalSemDesconto = Number(
            details.subtotalSemDesconto ?? b.total_value ?? 0,
          );
          const pct = Number(req.requested_percent);
          const descontoValor = subtotalSemDesconto * (pct / 100);
          const subtotalComDesconto = Math.max(0, subtotalSemDesconto - descontoValor);
          const valorSinal = Math.min(
            subtotalComDesconto,
            Number(details.valorSinal ?? 0),
          );
          const valorAReceber = Math.max(0, subtotalComDesconto - valorSinal);
          details.descontoPercentual = Number(pct.toFixed(2));
          details.descontoPercStr = String(pct);
          details.descontoValor = Number(descontoValor.toFixed(2));
          details.subtotalComDesconto = Number(subtotalComDesconto.toFixed(2));
          details.valorSinal = Number(valorSinal.toFixed(2));
          details.valorAReceber = Number(valorAReceber.toFixed(2));
          const newTotal = Number(subtotalComDesconto.toFixed(2));
          const { error: uErr } = await supabase
            .from("budgets")
            .update({ details: details as never, total_value: newTotal })
            .eq("id", req.budget_id);
          if (uErr) throw uErr;
          await supabase
            .from("orders")
            .update({ total_value: newTotal })
            .eq("budget_id", req.budget_id);
        }
      }
      const { error } = await supabase
        .from("discount_approval_requests")
        .update({
          status,
          decided_by: session?.user?.id,
          decided_at: new Date().toISOString(),
        })
        .eq("id", req.id);
      if (error) throw error;
      toast.success(
        status === "approved" ? "Desconto aprovado." : "Solicitação recusada.",
      );
      qc.invalidateQueries({ queryKey: ["discount-requests"] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      console.error(e);
      toast.error("Falha ao atualizar solicitação.");
    }
  }

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  const ownerLimit = Number(activeOperator?.permissions.max_discount_percent ?? 0);

  return (
    <div className="px-4 sm:px-6 lg:px-10 pt-3 space-y-2">
      {visible.map((r) => {
        const b = r.budget_id ? budgetsMap.get(r.budget_id) : undefined;
        return (
          <div
            key={r.id}
            className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 shadow-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="mt-0.5 h-8 w-8 rounded-full bg-emerald-600 text-white grid place-items-center shrink-0">
                <BellRing className="h-4 w-4" />
              </div>
              <div className="min-w-0 text-sm">
                <div className="font-semibold">Nova solicitação de desconto</div>
                <div className="text-emerald-800/90 mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
                  <span>
                    <span className="opacity-70">Usuário:</span>{" "}
                    <span className="font-medium">
                      {b?.operator_name || "—"}
                    </span>
                  </span>
                  <span>
                    <span className="opacity-70">Cliente:</span>{" "}
                    <span className="font-medium">{b?.client_name || "—"}</span>
                  </span>
                  <span>
                    <span className="opacity-70">Desconto:</span>{" "}
                    <span className="font-semibold">
                      {fmtPct(r.requested_percent)}
                    </span>
                  </span>
                  <span>
                    <span className="opacity-70">Limite:</span>{" "}
                    {fmtPct(ownerLimit)}
                  </span>
                  <span>
                    <span className="opacity-70">Orçamento:</span>{" "}
                    <span className="font-mono">{r.budget_number || "—"}</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => decide(r, "approved")}
              >
                <Check className="h-4 w-4 mr-1" /> Aprovar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => decide(r, "rejected")}
              >
                <XIcon className="h-4 w-4 mr-1" /> Recusar
              </Button>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => dismiss(r.id)}
                className="h-8 w-8 grid place-items-center rounded-md text-emerald-900/70 hover:bg-emerald-100"
                title="Fechar (mantém na lista de notificações)"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
