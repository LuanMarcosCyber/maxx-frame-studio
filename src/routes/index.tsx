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
      { property: "og:url", content: "https://total-maxx-system.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://total-maxx-system.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Total Maxx ERP",
          url: "https://total-maxx-system.lovable.app/",
        }),
      },
    ],
  }),
  component: Dashboard,
});

import { fmtMoney, fmtDateTime } from "@/lib/utils";

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

type RecentItem = {
  kind: "Orçamento" | "Pedido";
  id: string;
  number: string;
  client_name: string;
  total_value: number;
  status: string;
  created_at: string;
  to: "/orcamentos" | "/pedidos";
};

async function fetchBudgetsPart(monthStart: string) {
  const [countRes, recentRes] = await Promise.all([
    supabase
      .from("budgets")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart),
    supabase
      .from("budgets")
      .select("id, number, client_name, total_value, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  if (countRes.error) throw countRes.error;
  if (recentRes.error) throw recentRes.error;
  const recent: RecentItem[] = (recentRes.data ?? []).map((b) => ({
    kind: "Orçamento",
    id: b.id,
    number: b.number,
    client_name: b.client_name,
    total_value: Number(b.total_value),
    status: b.status,
    created_at: (b as { updated_at?: string }).updated_at ?? b.created_at,
    to: "/orcamentos",
  }));
  return { count: countRes.count ?? 0, recent };
}

async function fetchOrdersPart(monthStart: string) {
  const [countRes, revenueRes, recentRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart),
    supabase
      .from("orders")
      .select("total_value")
      .gte("created_at", monthStart),
    supabase
      .from("orders")
      .select("id, number, client_name, total_value, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  if (countRes.error) throw countRes.error;
  if (revenueRes.error) throw revenueRes.error;
  if (recentRes.error) throw recentRes.error;
  const revenue = (revenueRes.data ?? []).reduce(
    (s, o) => s + Number(o.total_value || 0),
    0,
  );
  const recent: RecentItem[] = (recentRes.data ?? []).map((o) => ({
    kind: "Pedido",
    id: o.id,
    number: o.number,
    client_name: o.client_name,
    total_value: Number(o.total_value),
    status: o.status,
    created_at: (o as { updated_at?: string }).updated_at ?? o.created_at,
    to: "/pedidos",
  }));
  return { count: countRes.count ?? 0, revenue, recent };
}

async function fetchProductsCount() {
  // Use paginated RPC to get the true total_count (includes global + own),
  // exactly matching what Produtos screen shows across all categories.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("list_visible_products_page", {
    _category: null,
    _search: null,
    _limit: 1,
    _offset: 0,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{ total_count: number | string }>;
  return rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;
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
  const { session, profile, role, ownerUserId } = useAuth();
  const monthStart = startOfMonth();
  const scope = ownerUserId ?? session?.user?.id ?? null;

  const commonOpts = {
    enabled: !!session && !!scope,
    staleTime: 0,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: true,
  };

  const budgetsQuery = useQuery({
    queryKey: ["budgets", "dashboard", scope, monthStart],
    queryFn: () => fetchBudgetsPart(monthStart),
    ...commonOpts,
  });
  const ordersQuery = useQuery({
    queryKey: ["orders", "dashboard", scope, monthStart],
    queryFn: () => fetchOrdersPart(monthStart),
    ...commonOpts,
  });
  const productsQuery = useQuery({
    queryKey: ["products", "count"],
    queryFn: fetchProductsCount,
    ...commonOpts,
  });

  const isLoading = budgetsQuery.isLoading || ordersQuery.isLoading || productsQuery.isLoading;
  const isError = budgetsQuery.isError || ordersQuery.isError || productsQuery.isError;
  const error = (budgetsQuery.error || ordersQuery.error || productsQuery.error) as Error | null;

  const recent = [
    ...(budgetsQuery.data?.recent ?? []),
    ...(ordersQuery.data?.recent ?? []),
  ]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 8);

  const data = {
    budgetsMonth: budgetsQuery.data?.count ?? 0,
    ordersMonth: ordersQuery.data?.count ?? 0,
    productsTotal: productsQuery.data ?? 0,
    revenueMonth: ordersQuery.data?.revenue ?? 0,
    recent,
  };

  const displayName =
    profile?.store_name || profile?.full_name || profile?.username || "";
  const subtitle =
    role === "admin"
      ? "Gerencie orçamentos, pedidos, produtos e revendedores da sua empresa."
      : "Gerencie orçamentos, pedidos e produtos da sua empresa.";

  const stats = [
    {
      label: "Orçamentos do mês",
      value: String(data.budgetsMonth),
      icon: FileText,
    },
    {
      label: "Pedidos do mês",
      value: String(data.ordersMonth),
      icon: ShoppingCart,
    },
    {
      label: "Produtos cadastrados",
      value: String(data.productsTotal),
      icon: Package,
    },
    {
      label: "Faturamento do mês",
      value: fmtMoney(data.revenueMonth),
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
              Bem-vindo de volta{displayName ? `, ${displayName}` : ""}
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
                      <li key={`${r.kind}-${r.id}`}>
                        <Link
                          to={r.to}
                          search={{ view: r.id }}
                          className="py-4 px-2 -mx-2 rounded-md flex items-center justify-between gap-4 hover:bg-muted/60 transition cursor-pointer"
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
                              {r.client_name} · {fmtDateTime(r.created_at)}
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
                        </Link>
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
