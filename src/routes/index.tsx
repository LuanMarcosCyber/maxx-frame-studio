import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  ShoppingCart,
  Package,
  Settings,
  Plus,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Total Maxx ERP" },
      { name: "description", content: "Painel principal do Total Maxx ERP: acompanhe orçamentos, pedidos, faturamento do mês e atividade recente em um só lugar." },
      { property: "og:title", content: "Dashboard — Total Maxx ERP" },
      { property: "og:description", content: "Painel principal do Total Maxx ERP com orçamentos, pedidos e indicadores do mês." },
      { property: "og:url", content: "https://maxx-frame-studio.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://maxx-frame-studio.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Total Maxx ERP",
          url: "https://maxx-frame-studio.lovable.app/",
        }),
      },
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

type DashboardData = {
  budgetsMonth: number;
  ordersMonth: number;
  productsTotal: number;
  revenueMonth: number;
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

  const [budgetsAll, ordersAll, productsAll, recentBudgets, recentOrders] =
    await Promise.all([
      supabase.from("budgets").select("id, created_at"),
      supabase.from("orders").select("id, total_value, created_at"),
      supabase.from("products").select("id"),
      supabase
        .from("budgets")
        .select("id, number, client_name, total_value, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("orders")
        .select("id, number, client_name, total_value, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  if (budgetsAll.error) throw budgetsAll.error;
  if (ordersAll.error) throw ordersAll.error;
  if (productsAll.error) throw productsAll.error;
  if (recentBudgets.error) throw recentBudgets.error;
  if (recentOrders.error) throw recentOrders.error;

  const budgets = budgetsAll.data ?? [];
  const orders = ordersAll.data ?? [];
  const products = productsAll.data ?? [];

  const budgetsMonth = budgets.filter((b) => b.created_at >= monthStart).length;
  const ordersMonth = orders.filter((o) => o.created_at >= monthStart).length;
  const revenueMonth = orders
    .filter((o) => o.created_at >= monthStart)
    .reduce((s, o) => s + Number(o.total_value || 0), 0);

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
    .slice(0, 6);

  return {
    budgetsMonth,
    ordersMonth,
    productsTotal: products.length,
    revenueMonth,
    recent,
  };
}

const quickActions = [
  {
    title: "Orçamentos",
    desc: "Criar e gerenciar orçamentos de clientes",
    icon: FileText,
    to: "/orcamentos" as const,
  },
  {
    title: "Pedidos",
    desc: "Acompanhar pedidos em andamento",
    icon: ShoppingCart,
    to: "/pedidos" as const,
  },
  {
    title: "Produtos",
    desc: "Catálogo completo de produtos",
    icon: Package,
    to: "/produtos" as const,
  },
  {
    title: "Configurações",
    desc: "Ajustes e preferências do sistema",
    icon: Settings,
    to: "/configuracoes" as const,
  },
];

function Dashboard() {
  const { session, profile, role } = useAuth();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard"],
    enabled: !!session,
    queryFn: fetchDashboard,
  });

  const displayName =
    profile?.full_name || profile?.username || "de volta";
  const subtitle =
    role === "admin"
      ? "Gerencie orçamentos, pedidos, produtos e revendedores da sua empresa."
      : "Gerencie orçamentos, pedidos e produtos da sua empresa.";

  const stats = [
    {
      label: "Orçamentos do mês",
      value: data ? String(data.budgetsMonth) : "0",
      icon: FileText,
    },
    {
      label: "Pedidos do mês",
      value: data ? String(data.ordersMonth) : "0",
      icon: ShoppingCart,
    },
    {
      label: "Produtos cadastrados",
      value: data ? String(data.productsTotal) : "0",
      icon: Package,
    },
    {
      label: "Faturamento do mês",
      value: data ? fmtMoney(data.revenueMonth) : fmtMoney(0),
      icon: ArrowRight,
    },
  ];

  return (
    <AppShell title="Início" subtitle="Painel principal da Total Maxx">
      <div className="space-y-10">
        {/* HERO */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-brand text-brand-foreground shadow-elegant">
          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
          <div className="relative px-8 py-12 lg:px-12 lg:py-16">
            <p className="text-3xl lg:text-4xl font-bold tracking-tight">
              Bem-vindo de volta
              {profile?.full_name ? `, ${profile.full_name}` : displayName !== "de volta" ? `, ${displayName}` : ""}
            </p>
            <p className="mt-3 text-base lg:text-lg text-brand-foreground/85 max-w-2xl leading-relaxed">
              {subtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="bg-brand-foreground text-brand hover:bg-brand-foreground/90 font-semibold"
              >
                <Link to="/orcamentos">
                  <Plus className="h-5 w-5" />
                  Novo Orçamento
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-brand-foreground/30 bg-transparent text-brand-foreground hover:bg-brand-foreground/10 hover:text-brand-foreground font-semibold"
              >
                <Link to="/pedidos">
                  Ver Pedidos
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* QUICK ACTIONS */}
        <section>
          <div className="mb-5">
            <h2 className="text-xl font-semibold tracking-tight">Acesso rápido</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Vá direto para as principais áreas do sistema.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((a) => (
              <Link key={a.to} to={a.to} className="group cursor-pointer">
                <Card className="p-6 h-full border-border/70 hover:border-primary/50 hover:shadow-elegant transition-all hover:-translate-y-0.5">
                  <div className="h-14 w-14 rounded-xl bg-gradient-brand grid place-items-center mb-5 shadow-brand group-hover:scale-105 transition-transform">
                    <a.icon className="h-7 w-7 text-brand-foreground" />
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    {a.title}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    {a.desc}
                  </p>
                  <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    Abrir
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* RESUMO + ATIVIDADE */}
        <section>
          <div className="mb-5">
            <h2 className="text-xl font-semibold tracking-tight">
              Resumo da Operação do Mês
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Indicadores do mês corrente baseados em dados reais.
            </p>
          </div>

          {isError ? (
            <Card className="p-6 border-destructive/40">
              <p className="text-sm text-destructive">
                Não foi possível carregar os dados:{" "}
                {(error as Error)?.message ?? "erro desconhecido."}
              </p>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((s) => (
                  <Card key={s.label} className="p-5 border-border/70">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <s.icon className="h-4 w-4" />
                      <span className="text-xs font-medium uppercase tracking-wider">
                        {s.label}
                      </span>
                    </div>
                    <div className="mt-3 text-2xl font-bold tracking-tight text-foreground">
                      {isLoading ? (
                        <span className="inline-block h-7 w-20 rounded bg-muted animate-pulse" />
                      ) : (
                        s.value
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              <Card className="mt-6 p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-base font-semibold">Atividade recente</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Últimos orçamentos e pedidos registrados
                    </p>
                  </div>
                </div>
                {isLoading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-14 rounded bg-muted animate-pulse"
                      />
                    ))}
                  </div>
                ) : !data || data.recent.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">
                    Nenhuma atividade recente.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {data.recent.map((r) => (
                      <li
                        key={`${r.kind}-${r.id}`}
                        className="py-4 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                              {r.kind}
                            </span>
                            <span className="text-sm font-semibold text-foreground">
                              #{r.number}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1 truncate">
                            {r.client_name} · {fmtDate(r.created_at)}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="text-sm font-semibold text-foreground">
                            {fmtMoney(r.total_value)}
                          </span>
                          <span className="text-[11px] px-2.5 py-1 rounded-full bg-accent text-accent-foreground font-medium">
                            {r.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
