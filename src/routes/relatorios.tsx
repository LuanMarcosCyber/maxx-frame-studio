import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Total Maxx ERP" }] }),
  component: Relatorios,
});

function Relatorios() {
  return (
    <AppShell title="Relatórios" subtitle="Acompanhe o desempenho da sua loja">
      <Card className="p-10 text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-gradient-brand grid place-items-center text-brand-foreground shadow-brand mb-4">
          <BarChart3 className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Relatórios em breve
        </h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Aqui você poderá acompanhar vendas, pedidos, clientes e desempenho da loja.
        </p>
      </Card>
    </AppShell>
  );
}
