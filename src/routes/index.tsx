import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Total Maxx ERP" },
      { name: "description", content: "Painel do revendedor Total Maxx." },
    ],
  }),
  component: Dashboard,
});

const fmtMoney = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
function startOfPrevMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString();
}

type DashboardData = {
  budgetsTotal: number;
  budgetsPending: number;
  budgetsThisMonth: number;
  budgetsPrevMonth: number;
  ordersTotal: number;
  ordersInProgress: number;
  productsTotal: number;
  productsCategories: number;
  revenueThisMonth: number;
  revenuePrevMonth: number;
  recent: Array<{
    kind: "Orçamento" | "Pedido";
    id: string;
    number: string;
    client_name: string;
    total_value: number;
    status: string;
    created_at: string;
    to: "/orcamentos" | "/pedidos";
  }>;
};

async function fetchDashboard(): Promise<DashboardData> {
  const monthStart = startOfMonth();
  const prevStart = startOfPrevMonth();

  const [
    budgetsAll,
    ordersAll,
    productsAll,
    recentBudgets,
    recentOrders,
  ] = await Promise.all([
    supabase.from("budgets").select("id, status, total_value, created_at"),
    supabase.from("orders").select("id, status, total_value, created_at"),
    supabase.from("products").select("id, category"),
    supabase
      .from("budgets")
      .select("id, number, client_name, total_value, status, created_at")
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .from("orders")
      .select("id, number, client_name, total_value, status, created_at")
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  if (budgetsAll.error) throw budgetsAll.error;
  if (ordersAll.error) throw ordersAll.error;
  if (productsAll.error) throw productsAll.error;
  if (recentBudgets.error) throw recentBudgets.error;
  if (recentOrders.error) throw recentOrders.error;

  const budgets = budgetsAll.data ?? [];
  const orders = ordersAll.data ?? [];
  const products = productsAll.data ?? [];

  const budgetsThisMonth = budgets.filter((b) => b.created_at >= monthStart).length;
  const budgetsPrevMonth = budgets.filter(
    (b) => b.created_at >= prevStart && b.created_at < monthStart,
  ).length;

  const revenueThisMonth = orders
    .filter((o) => o.created_at >= monthStart)
    .reduce((s, o) => s + Number(o.total_value || 0), 0);
  const revenuePrevMonth = orders
    .filter((o) => o.created_at >= prevStart && o.created_at < monthStart)
    .reduce((s, o) => s + Number(o.total_value || 0), 0);

  const categories = new Set(
    products.map((p) => p.category).filter((c): c is string => !!c),
  );

  const recent = [
    ...(recentBudgets.data ?? []).map((b) => ({
      kind: "Orçamento" as const,
      ...b,
      total_value: Number(b.total_value),
      to: "/orcamentos" as const,
    })),
    ...(recentOrders.data ?? []).map((o) => ({
      kind: "Pedido" as const,
      ...o,
      total_value: Number(o.total_value),
      to: "/pedidos" as const,
    })),
  ]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 4);

  return {
    budgetsTotal: budgets.length,
    budgetsPending: budgets.filter((b) => b.status === "Pendente").length,
    budgetsThisMonth,
    budgetsPrevMonth,
    ordersTotal: orders.length,
    ordersInProgress: orders.filter(
      (o) => o.status === "Em produção" || o.status === "Aguardando",
    ).length,
    productsTotal: products.length,
    productsCategories: categories.size,
    revenueThisMonth,
    revenuePrevMonth,
    recent,
  };
}

function trendLabel(curr: number, prev: number, suffix: string) {
  if (prev === 0) {
    return curr === 0 ? "Sem dados anteriores" : `+${curr} ${suffix}`;
  }
  const pct = Math.round(((curr - prev) / prev) * 100);
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct}% vs. mês anterior`;
}

function Dashboard() {
  const { session, profile } = useAuth();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard"],
    enabled: !!session,
    queryFn: fetchDashboard,
  });

  const cards = [
    {
      title: "Orçamentos",
      desc: "Crie e gerencie orçamentos de molduras",
      icon: FileText,
      to: "/orcamentos" as const,
      stat: data ? String(data.budgetsTotal) : "0",
      trend: data
        ? trendLabel(data.budgetsThisMonth, data.budgetsPrevMonth, "este mês")
        : "—",
      sub: data ? `${data.budgetsPending} pendentes` : "",
    },
    {
      title: "Pedidos",
      desc: "Acompanhe pedidos em produção",
      icon: ShoppingCart,
      to: "/pedidos" as const,
      stat: data ? String(data.ordersTotal) : "0",
      trend: data ? `${data.ordersInProgress} em andamento` : "—",
    },
    {
      title: "Produtos",
      desc: "Catálogo de molduras, foam, vidro e paspatur",
      icon: Package,
      to: "/produtos" as const,
      stat: data ? String(data.productsTotal) : "0",
      trend: data ? `${data.productsCategories} categorias` : "—",
    },
    {
      title: "Faturamento",
      desc: "Soma dos pedidos no mês atual",
      icon: BarChart3,
      to: "/pedidos" as const,
      stat: data ? fmtMoney(data.revenueThisMonth) : fmtMoney(0),
      trend: data
        ? trendLabel(data.revenueThisMonth, data.revenuePrevMonth, "este mês")
        : "—",
    },
  ];

  const welcomeName = profile?.full_name || "de volta";

  return (
    <AppShell
      title={`Bem-vindo${profile?.full_name ? ", " + profile.full_name : " de volta"}`}
      subtitle="Aqui está um resumo da sua operação na Total Maxx"
    >
      {isError ? (
        <Card className="p-6 border-destructive/40">
          <p className="text-sm text-destructive">
            Não foi possível carregar os dados do painel:{" "}
            {(error as Error)?.message ?? "erro desconhecido."}
          </p>
        </Card>
      ) : (
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
                      {isLoading ? (
                        <span className="inline-block h-7 w-16 rounded bg-muted animate-pulse" />
                      ) : (
                        c.stat
                      )}
                    </div>
                    <div className="text-sm font-semibold text-foreground mt-1">
                      {c.title}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {c.desc}
                    </p>
                    <div className="flex items-center gap-1 mt-4 text-[11px] text-primary font-medium">
                      <TrendingUp className="h-3 w-3" />
                      {isLoading ? "Carregando..." : c.trend}
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
              {isLoading ? (
                <p className="py-6 text-sm text-muted-foreground">Carregando...</p>
              ) : !data || data.recent.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  Nenhuma atividade recente.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.recent.map((r) => (
                    <li
                      key={`${r.kind}-${r.id}`}
                      className="py-3 flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="text-sm font-medium">
                          {r.kind} #{r.number}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.client_name} · {fmtDate(r.created_at)}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold">
                          {fmtMoney(r.total_value)}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium">
                          {r.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
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
      )}
    </AppShell>
  );
}
