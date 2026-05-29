import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Plus, MoreHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/produtos")({
  head: () => ({ meta: [{ title: "Produtos — Total Maxx ERP" }] }),
  component: Produtos,
});

const fmtMoney = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (n: number) => `${Number(n).toLocaleString("pt-BR")}%`;

function Produtos() {
  const { session } = useAuth();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["products"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, description, value_per_meter, profit_margin, waste_percentage")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell
      title="Produtos"
      subtitle="Cadastre molduras, foam, paspatur, vidro e componentes"
    >
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
            <div className="relative w-full sm:max-w-sm">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar produto..." className="pl-9" />
            </div>
            <Button className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand">
              <Plus className="h-4 w-4 mr-1.5" /> Novo Produto
            </Button>
          </div>

          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
                  <th className="font-medium py-3 px-6">Código</th>
                  <th className="font-medium py-3 px-3">Descrição</th>
                  <th className="font-medium py-3 px-3">Valor/m</th>
                  <th className="font-medium py-3 px-3">Margem</th>
                  <th className="font-medium py-3 px-3">Perda</th>
                  <th className="font-medium py-3 px-6"></th>
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
                      Nenhum produto cadastrado.
                    </td>
                  </tr>
                ) : (
                  rows.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/40 transition">
                      <td className="py-3.5 px-6 font-mono font-semibold">{p.code}</td>
                      <td className="py-3.5 px-3">{p.description}</td>
                      <td className="py-3.5 px-3 font-semibold">
                        {fmtMoney(Number(p.value_per_meter))}
                      </td>
                      <td className="py-3.5 px-3 text-muted-foreground">
                        {fmtPct(Number(p.profit_margin))}
                      </td>
                      <td className="py-3.5 px-3 text-muted-foreground">
                        {fmtPct(Number(p.waste_percentage))}
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

        <Card className="p-6">
          <h3 className="text-base font-semibold">Cadastrar produto</h3>
          <p className="text-xs text-muted-foreground mb-5">
            Preencha as informações abaixo
          </p>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cod">Código</Label>
              <Input id="cod" placeholder="MOL-000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Descrição</Label>
              <Input id="desc" placeholder="Ex: Moldura Lisa 30mm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="val">Valor do metro (R$)</Label>
              <Input id="val" placeholder="0,00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mar">Margem (%)</Label>
                <Input id="mar" placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="per">Perda (%)</Label>
                <Input id="per" placeholder="0" />
              </div>
            </div>
            <Button className="w-full bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand">
              Salvar produto
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
