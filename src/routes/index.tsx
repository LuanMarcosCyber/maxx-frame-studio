import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import {
  FileText,
  ShoppingCart,
  Package,
  BarChart3,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Total Maxx ERP" },
      { name: "description", content: "Painel do revendedor Total Maxx." },
    ],
  }),
  component: Dashboard,
});

const cards = [
  {
    title: "Orçamentos",
    desc: "Crie e gerencie orçamentos de molduras",
    icon: FileText,
    to: "/orcamentos" as const,
    stat: "24",
    trend: "+12% este mês",
  },
  {
    title: "Pedidos",
    desc: "Acompanhe pedidos em produção",
    icon: ShoppingCart,
    to: "/pedidos" as const,
    stat: "8",
    trend: "3 em andamento",
  },
  {
    title: "Produtos",
    desc: "Catálogo de molduras, foam, vidro e paspatur",
    icon: Package,
    to: "/produtos" as const,
    stat: "156",
    trend: "12 categorias",
  },
  {
    title: "Relatórios",
    desc: "Análise de vendas e performance",
    icon: BarChart3,
    to: "/orcamentos" as const,
    stat: "R$ 42k",
    trend: "+18% vs anterior",
  },
];

function Dashboard() {
  return (
    <AppShell
      title="Bem-vindo de volta, Revendedor"
      subtitle="Aqui está um resumo da sua operação na Total Maxx"
    >
      <div className="space-y-8">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c) => (
            <Link key={c.title} to={c.to} className="group">
              <Card className="p-6 h-full border-border/70 hover:border-primary/40 transition-all hover:shadow-elegant relative overflow-hidden">
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-brand-soft opacity-[0.06] group-hover:opacity-[0.12] transition" />
                <div className="flex items-start justify-between">
                  <div className="h-11 w-11 rounded-lg bg-gradient-brand grid place-items-center shadow-brand">
                    <c.icon className="h-5 w-5 text-brand-foreground" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition" />
                </div>
                <div className="mt-5">
                  <div className="text-3xl font-bold tracking-tight text-foreground">
                    {c.stat}
                  </div>
                  <div className="text-sm font-semibold text-foreground mt-1">
                    {c.title}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {c.desc}
                  </p>
                  <div className="flex items-center gap-1 mt-4 text-[11px] text-primary font-medium">
                    <TrendingUp className="h-3 w-3" />
                    {c.trend}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold">Atividade recente</h2>
                <p className="text-xs text-muted-foreground">
                  Últimos orçamentos e pedidos
                </p>
              </div>
            </div>
            <ul className="divide-y divide-border">
              {[
                ["Orçamento #1042", "Maria Silva", "R$ 1.240,00", "Aprovado"],
                ["Pedido #876", "Carlos Andrade", "R$ 3.890,00", "Produção"],
                ["Orçamento #1041", "Loja Quadros RJ", "R$ 760,00", "Pendente"],
                ["Pedido #875", "Atelier Norte", "R$ 2.110,00", "Entregue"],
              ].map(([title, client, value, status]) => (
                <li
                  key={title}
                  className="py-3 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="text-sm font-medium">{title}</div>
                    <div className="text-xs text-muted-foreground">{client}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold">{value}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium">
                      {status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-6 bg-gradient-brand-soft text-brand-foreground border-0 relative overflow-hidden">
            <div className="relative">
              <h3 className="text-lg font-bold">Novo orçamento</h3>
              <p className="text-sm text-brand-foreground/80 mt-1">
                Monte rapidamente um orçamento de moldura, foam, paspatur e vidro.
              </p>
              <Link
                to="/orcamentos"
                className="inline-flex items-center gap-2 mt-6 px-4 py-2 rounded-md bg-brand-foreground text-brand text-sm font-semibold hover:opacity-90 transition"
              >
                Criar agora
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
