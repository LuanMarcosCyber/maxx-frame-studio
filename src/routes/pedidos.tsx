import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, MoreHorizontal } from "lucide-react";

export const Route = createFileRoute("/pedidos")({
  head: () => ({ meta: [{ title: "Pedidos — Total Maxx ERP" }] }),
  component: Pedidos,
});

const rows = [
  ["#876", "Carlos Andrade", "12/05/2026", "R$ 3.890,00", "Em produção"],
  ["#875", "Atelier Norte", "10/05/2026", "R$ 2.110,00", "Entregue"],
  ["#874", "Maria Silva", "08/05/2026", "R$ 1.240,00", "Em produção"],
  ["#873", "Loja Quadros RJ", "06/05/2026", "R$ 760,00", "Aguardando"],
  ["#872", "Galeria Vértice", "04/05/2026", "R$ 540,00", "Entregue"],
];

const statusStyle: Record<string, string> = {
  "Em produção": "bg-blue-100 text-blue-700",
  Entregue: "bg-emerald-100 text-emerald-700",
  Aguardando: "bg-amber-100 text-amber-700",
};

function Pedidos() {
  return (
    <AppShell title="Pedidos" subtitle="Acompanhe o status dos seus pedidos">
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
          <div className="relative w-full sm:max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar pedido ou cliente..." className="pl-9" />
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
              {rows.map(([n, cli, dt, val, st]) => (
                <tr key={n} className="hover:bg-muted/40 transition">
                  <td className="py-3.5 px-6 font-mono font-semibold">{n}</td>
                  <td className="py-3.5 px-3">{cli}</td>
                  <td className="py-3.5 px-3 text-muted-foreground">{dt}</td>
                  <td className="py-3.5 px-3 font-semibold">{val}</td>
                  <td className="py-3.5 px-3">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusStyle[st]}`}
                    >
                      {st}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    <button className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent transition">
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
