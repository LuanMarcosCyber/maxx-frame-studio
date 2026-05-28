import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Plus, MoreHorizontal } from "lucide-react";

export const Route = createFileRoute("/produtos")({
  head: () => ({ meta: [{ title: "Produtos — Total Maxx ERP" }] }),
  component: Produtos,
});

const rows = [
  ["MOL-001", "Moldura Clássica Dourada 30mm", "R$ 48,00", "35%", "5%"],
  ["MOL-014", "Moldura Lisa Preta 20mm", "R$ 22,50", "40%", "4%"],
  ["FOA-003", "Foam Branco 5mm", "R$ 12,80", "30%", "3%"],
  ["PSP-008", "Paspatur Creme 1.5mm", "R$ 18,00", "35%", "6%"],
  ["VID-002", "Vidro Antirreflexo 2mm", "R$ 65,00", "28%", "8%"],
  ["DEC-011", "Cantoneira Decorativa Bronze", "R$ 9,40", "45%", "2%"],
];

function Produtos() {
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
                {rows.map(([cod, desc, val, mar, per]) => (
                  <tr key={cod} className="hover:bg-muted/40 transition">
                    <td className="py-3.5 px-6 font-mono font-semibold">{cod}</td>
                    <td className="py-3.5 px-3">{desc}</td>
                    <td className="py-3.5 px-3 font-semibold">{val}</td>
                    <td className="py-3.5 px-3 text-muted-foreground">{mar}</td>
                    <td className="py-3.5 px-3 text-muted-foreground">{per}</td>
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
