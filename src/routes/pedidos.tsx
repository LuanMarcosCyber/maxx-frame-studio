import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Plus, MoreHorizontal, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BudgetSummaryById } from "./orcamentos.index";


export const Route = createFileRoute("/pedidos")({
  head: () => ({ meta: [{ title: "Pedidos — Total Maxx ERP" }] }),
  component: Pedidos,
});

const statusStyle: Record<string, string> = {
  Aprovado: "bg-emerald-100 text-emerald-700",
  "Em produção": "bg-blue-100 text-blue-700",
  Entregue: "bg-emerald-100 text-emerald-700",
  Aguardando: "bg-amber-100 text-amber-700",
};

const fmtMoney = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");

function Pedidos() {
  const { session } = useAuth();
  const [viewingBudgetId, setViewingBudgetId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["orders"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, number, client_name, total_value, status, created_at, budget_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (o) =>
        o.number.toLowerCase().includes(q) ||
        (o.client_name ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <AppShell title="Pedidos" subtitle="Acompanhe o status dos seus pedidos">
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
          <div className="relative w-full sm:max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar pedido ou cliente..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand">
            <Plus className="h-4 w-4 mr-1.5" /> Novo Pedido
          </Button>
        </div>

        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
                <th className="font-medium py-3 px-6">Pedido</th>
                <th className="font-medium py-3 px-3">Cliente</th>
                <th className="font-medium py-3 px-3">Data</th>
                <th className="font-medium py-3 px-3">Valor total</th>
                <th className="font-medium py-3 px-3">Status</th>
                <th className="font-medium py-3 px-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhum pedido cadastrado.
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/40 transition">
                    <td className="py-3.5 px-6 font-mono font-semibold">{o.number}</td>
                    <td className="py-3.5 px-3">{o.client_name}</td>
                    <td className="py-3.5 px-3 text-muted-foreground">
                      {fmtDate(o.created_at)}
                    </td>
                    <td className="py-3.5 px-3 font-semibold">
                      {fmtMoney(Number(o.total_value))}
                    </td>
                    <td className="py-3.5 px-3">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          statusStyle[o.status] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Ações"
                            className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent transition"
                          >
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {o.budget_id ? (
                            <DropdownMenuItem asChild>
                              <Link
                                to="/orcamentos"
                                search={{ view: o.budget_id }}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Ver orçamento
                              </Link>
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem disabled>
                              <Eye className="h-4 w-4 mr-2" />
                              Sem orçamento vinculado
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
