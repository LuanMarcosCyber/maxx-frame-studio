import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, MoreHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/orcamentos")({
  head: () => ({ meta: [{ title: "Orçamentos — Total Maxx ERP" }] }),
  component: Orcamentos,
});

const statusStyle: Record<string, string> = {
  Aprovado: "bg-emerald-100 text-emerald-700",
  Pendente: "bg-amber-100 text-amber-700",
  Recusado: "bg-red-100 text-red-700",
};

const fmtMoney = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");

function Orcamentos() {
  const { session } = useAuth();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["budgets"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("id, number, client_name, total_value, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell title="Orçamentos" subtitle="Gerencie todos os orçamentos da sua revenda">
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
          <div className="relative w-full sm:max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por cliente ou número..." className="pl-9" />
          </div>
          <Button asChild className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand">
            <Link to="/orcamentos/novo">
              <Plus className="h-4 w-4 mr-1.5" /> Novo Orçamento
            </Link>
          </Button>
        </div>

        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
                <th className="font-medium py-3 px-6">Número</th>
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
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhum orçamento cadastrado.
                  </td>
                </tr>
              ) : (
                rows.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/40 transition">
                    <td className="py-3.5 px-6 font-mono font-semibold text-foreground">
                      {b.number}
                    </td>
                    <td className="py-3.5 px-3">{b.client_name}</td>
                    <td className="py-3.5 px-3 text-muted-foreground">
                      {fmtDate(b.created_at)}
                    </td>
                    <td className="py-3.5 px-3 font-semibold">
                      {fmtMoney(Number(b.total_value))}
                    </td>
                    <td className="py-3.5 px-3">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          statusStyle[b.status] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <button className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent transition">
                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                      </button>
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
