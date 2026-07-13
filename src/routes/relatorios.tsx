import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { fmtMoney, fmtDateTime, fmtPct, cn } from "@/lib/utils";
import {
  getVendasOptions,
  getVendasReport,
  getProdutosFornecedoresReport,
  getOrcamentosReport,
  getClientesReport,
  getColaboradoresReport,
  type VendasFilters,
  type OrcamentosFilters,
  type ClientesFilters,
} from "@/lib/reports.functions";
import {
  Search,
  BarChart3,
  TrendingUp,
  FileText,
  Package,
  Factory,
  Users,
  UserCog,
  Building2,
  Filter,
  DollarSign,
  ShoppingCart,
  Receipt,
  Percent,
  Wallet,
  Trophy,
  Boxes,
  Tag,
  CheckCircle2,
  Clock,
  XCircle,
  UserPlus,
  Repeat,
  TrendingDown,
  Award,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";


export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Total Maxx ERP" },
      {
        name: "description",
        content:
          "Central de relatórios do Total Maxx ERP: consulte vendas, orçamentos, produtos, clientes, colaboradores e empresas.",
      },
    ],
  }),
  component: Relatorios,
});

type ReportKey =
  | "vendas"
  | "orcamentos"
  | "produtos"
  | "fornecedores"
  | "clientes"
  | "colaboradores"
  | "empresas";

interface ReportCardDef {
  key: ReportKey;
  title: string;
  description: string;
  icon: typeof BarChart3;
  adminOnly?: boolean;
}

const REPORT_CARDS: ReportCardDef[] = [
  { key: "vendas", title: "Vendas", description: "Analise faturamento, pedidos e desempenho de vendas.", icon: TrendingUp },
  { key: "orcamentos", title: "Orçamentos", description: "Consulte orçamentos criados, aprovados e pendentes.", icon: FileText },
  { key: "produtos", title: "Produtos", description: "Veja utilização, vendas e desempenho dos produtos.", icon: Package },
  { key: "fornecedores", title: "Fornecedores", description: "Analise quanto cada fornecedor representa nas vendas.", icon: Factory },
  { key: "clientes", title: "Clientes", description: "Consulte histórico e ranking dos clientes.", icon: Users },
  { key: "colaboradores", title: "Colaboradores", description: "Acompanhe produtividade, descontos e desempenho.", icon: UserCog },
  { key: "empresas", title: "Empresas", description: "Visualize indicadores das empresas/revendedores.", icon: Building2, adminOnly: true },
];

const STATUS_OPTIONS = [
  "Aguardando",
  "Aguardando pagamento",
  "Aprovado",
  "Em produção",
  "Finalizado",
  "Entregue",
  "Cancelado",
];

function Relatorios() {
  const { role, session } = useAuth();
  const isAdmin = role === "admin";
  const [selected, setSelected] = useState<ReportKey | null>(null);
  const [period, setPeriod] = useState<string>("mes");
  const [status, setStatus] = useState<string>("todos");
  const [clientId, setClientId] = useState<string>("todos");
  const [operatorId, setOperatorId] = useState<string>("todos");
  const [empresaUserId, setEmpresaUserId] = useState<string>("todos");
  const [category, setCategory] = useState<string>("todos");
  const [supplier, setSupplier] = useState<string>("todos");
  const [productId, setProductId] = useState<string>("todos");
  const [granularity, setGranularity] = useState<string>("mes");
  const [cityFilter, setCityFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");

  const visibleCards = REPORT_CARDS.filter((c) => !c.adminOnly || isAdmin);
  const showCategoryFilter = selected === "produtos" || selected === "fornecedores";
  const showSupplierFilter = selected === "produtos";
  const showProductFilter = selected === "produtos";
  const showGranularity = selected === "orcamentos";
  const showCityFilter = selected === "clientes";

  const fetchOptions = useServerFn(getVendasOptions);

  const optionsQuery = useQuery({
    queryKey: ["relatorios", "options"],
    queryFn: () => fetchOptions(),
    staleTime: 60_000,
    enabled: !!session,
  });


  return (
    <AppShell
      title="Relatórios"
      subtitle="Consulte informações, acompanhe indicadores e pesquise qualquer dado cadastrado no sistema."
    >
      <div className="space-y-4">
        <Card className="p-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar cliente, pedido, orçamento, produto, fornecedor, colaborador..."
              className="pl-10 h-10 text-sm border-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </Card>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-2">
            O que você deseja analisar?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {visibleCards.map((c) => {
              const Icon = c.icon;
              const active = selected === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setSelected(c.key)}
                  className={cn(
                    "group text-left rounded-xl border bg-card p-3 shadow-sm cursor-pointer transition-all",
                    "hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40",
                    active && "border-primary ring-1 ring-primary shadow-md",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "h-9 w-9 rounded-lg grid place-items-center shrink-0 transition-colors",
                        active
                          ? "bg-gradient-brand text-brand-foreground shadow-brand"
                          : "bg-muted text-foreground group-hover:bg-gradient-brand group-hover:text-brand-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-foreground">{c.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                        {c.description}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Filtros</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">

              <div className="space-y-1.5">
                <Label>Período</Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hoje">Hoje</SelectItem>
                    <SelectItem value="ontem">Ontem</SelectItem>
                    <SelectItem value="semana">Últimos 7 dias</SelectItem>
                    <SelectItem value="mes">Este mês</SelectItem>
                    <SelectItem value="ano">Este ano</SelectItem>
                    <SelectItem value="todos">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {(optionsQuery.data?.clients ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Colaborador</Label>
                <Select value={operatorId} onValueChange={setOperatorId}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {(optionsQuery.data?.operators ?? []).map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isAdmin && (
                <div className="space-y-1.5">
                  <Label>Empresa</Label>
                  <Select value={empresaUserId} onValueChange={setEmpresaUserId}>
                    <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas</SelectItem>
                      {(optionsQuery.data?.empresas ?? []).map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showCategoryFilter && (
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas</SelectItem>
                      {(optionsQuery.data?.categories ?? []).map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showSupplierFilter && (
                <div className="space-y-1.5">
                  <Label>Fornecedor</Label>
                  <Select value={supplier} onValueChange={setSupplier}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {(optionsQuery.data?.suppliers ?? []).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showProductFilter && (
                <div className="space-y-1.5">
                  <Label>Produto</Label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {(optionsQuery.data?.products ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showGranularity && (
                <div className="space-y-1.5">
                  <Label>Agrupar por</Label>
                  <Select value={granularity} onValueChange={setGranularity}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dia">Dia</SelectItem>
                      <SelectItem value="semana">Semana</SelectItem>
                      <SelectItem value="mes">Mês</SelectItem>
                      <SelectItem value="ano">Ano</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showCityFilter && (
                <div className="space-y-1.5">
                  <Label>Cidade</Label>
                  <Select value={cityFilter} onValueChange={setCityFilter}>
                    <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas</SelectItem>
                      {(optionsQuery.data?.cities ?? []).map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </Card>
        </section>

        <section>
          <ReportResults
            selected={selected}
            filters={{
              period,
              status,
              clientId: clientId === "todos" ? undefined : clientId,
              operatorId: operatorId === "todos" ? undefined : operatorId,
              empresaUserId: empresaUserId === "todos" ? undefined : empresaUserId,
              category: category === "todos" ? undefined : category,
              supplier: supplier === "todos" ? undefined : supplier,
              productId: productId === "todos" ? undefined : productId,
            }}
            granularity={granularity}
            cityFilter={cityFilter === "todos" ? undefined : cityFilter}
            search={search}
          />
        </section>
      </div>
    </AppShell>
  );
}

function ReportResults({
  selected,
  filters,
  granularity,
  cityFilter,
  search,
}: {
  selected: ReportKey | null;
  filters: VendasFilters;
  granularity: string;
  cityFilter?: string;
  search: string;
}) {
  if (!selected) {
    return (
      <Card className="p-12 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-muted grid place-items-center text-muted-foreground mb-4">
          <BarChart3 className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Selecione um relatório
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Escolha uma categoria acima para visualizar informações detalhadas do sistema.
        </p>
      </Card>
    );
  }

  if (selected === "vendas") {
    return <VendasReportView filters={filters} search={search} />;
  }

  if (selected === "fornecedores") {
    return <FornecedoresReportView filters={filters} search={search} />;
  }

  if (selected === "produtos") {
    return <ProdutosReportView filters={filters} search={search} />;
  }

  if (selected === "orcamentos") {
    return <OrcamentosReportView filters={{ ...filters, granularity }} search={search} />;
  }

  if (selected === "clientes") {
    return <ClientesReportView filters={{ ...filters, cityFilter }} search={search} />;
  }

  if (selected === "colaboradores") {
    return <ColaboradoresReportView filters={filters} search={search} />;
  }

  const label = REPORT_CARDS.find((c) => c.key === selected)?.title ?? "";
  return (
    <Card className="p-10 text-center">
      <h3 className="text-lg font-semibold text-foreground mb-2">
        Relatório de {label}
      </h3>
      <p className="text-sm text-muted-foreground">
        Em breve: indicadores, gráficos, rankings e exportação (PDF/Excel).
      </p>
    </Card>
  );
}


function VendasReportView({
  filters,
  search,
}: {
  filters: VendasFilters;
  search: string;
}) {
  const fetchReport = useServerFn(getVendasReport);
  const query = useQuery({
    queryKey: ["relatorios", "vendas", filters],
    queryFn: () => fetchReport({ data: filters }),
    staleTime: 15_000,
  });

  const filteredOrders = useMemo(() => {
    const list = query.data?.orders ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (o) =>
        o.number.toLowerCase().includes(s) ||
        o.client_name.toLowerCase().includes(s) ||
        (o.operator_name ?? "").toLowerCase().includes(s),
    );
  }, [query.data, search]);

  // Recompute summary reflecting the search filter (so numbers match the visible table)
  const summary = useMemo(() => {
    if (!query.data) {
      return { faturamento: 0, totalPedidos: 0, ticketMedio: 0, totalDescontos: 0, valorRecebido: 0 };
    }
    if (!search.trim()) return query.data.summary;
    const faturamento = filteredOrders.reduce((s, o) => s + o.total_value, 0);
    const totalDescontos = filteredOrders.reduce((s, o) => s + o.discount_value, 0);
    return {
      faturamento,
      totalPedidos: filteredOrders.length,
      ticketMedio: filteredOrders.length ? faturamento / filteredOrders.length : 0,
      totalDescontos,
      valorRecebido: query.data.summary.valorRecebido,
    };
  }, [filteredOrders, search, query.data]);

  if (query.isLoading) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        Carregando relatório de vendas...
      </Card>
    );
  }

  if (query.error) {
    return (
      <Card className="p-10 text-center text-sm text-destructive">
        Erro ao carregar dados. Tente novamente.
      </Card>
    );
  }

  const cards = [
    { label: "Faturamento total", value: fmtMoney(summary.faturamento), icon: DollarSign },
    { label: "Total de pedidos", value: String(summary.totalPedidos), icon: ShoppingCart },
    { label: "Ticket médio", value: fmtMoney(summary.ticketMedio), icon: Receipt },
    { label: "Total de descontos", value: fmtMoney(summary.totalDescontos), icon: Percent },
    { label: "Valor recebido / sinal", value: fmtMoney(summary.valorRecebido), icon: Wallet },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                  {c.label}
                </div>
                <div className="h-9 w-9 rounded-lg bg-gradient-brand text-brand-foreground grid place-items-center shadow-brand">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground tracking-tight">
                {c.value}
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <div className="p-5 border-b">
          <h3 className="text-base font-semibold text-foreground">
            Pedidos do período
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filteredOrders.length} pedido(s) encontrado(s)
          </p>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-muted grid place-items-center text-muted-foreground mb-3">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">
              Nenhum pedido encontrado para os filtros selecionados.
            </p>
          </div>
        ) : (
          <div className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Desconto</TableHead>
                  <TableHead>Pagamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.number}</TableCell>
                    <TableCell>{o.client_name}</TableCell>
                    <TableCell>{o.operator_name ?? "—"}</TableCell>
                    <TableCell>{fmtDateTime(o.created_at)}</TableCell>
                    <TableCell>
                      <span className="inline-flex px-2 py-0.5 rounded-md text-xs bg-muted text-foreground">
                        {o.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {fmtMoney(o.total_value)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {o.discount_value > 0 ? fmtMoney(o.discount_value) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {o.payment_method ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function EmptyResults({ label }: { label: string }) {
  return (
    <div className="p-12 text-center">
      <div className="mx-auto h-14 w-14 rounded-full bg-muted grid place-items-center text-muted-foreground mb-3">
        <BarChart3 className="h-6 w-6" />
      </div>
      <p className="text-sm text-muted-foreground">
        Nenhum resultado encontrado para os filtros selecionados.
      </p>
      {label && <p className="text-xs text-muted-foreground/70 mt-1">{label}</p>}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string;
  icon: typeof BarChart3;
  sub?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </div>
        <div className="h-9 w-9 rounded-lg bg-gradient-brand text-brand-foreground grid place-items-center shadow-brand">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-xl font-bold text-foreground tracking-tight break-words">
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function FornecedoresReportView({
  filters,
  search,
}: {
  filters: VendasFilters;
  search: string;
}) {
  const fetchReport = useServerFn(getProdutosFornecedoresReport);
  const query = useQuery({
    queryKey: ["relatorios", "fornecedores", filters],
    queryFn: () => fetchReport({ data: filters }),
    staleTime: 15_000,
  });

  const suppliers = useMemo(() => {
    const list = query.data?.suppliers ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter((r) => r.supplier.toLowerCase().includes(s));
  }, [query.data, search]);

  if (query.isLoading) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        Carregando relatório de fornecedores...
      </Card>
    );
  }
  if (query.error) {
    return (
      <Card className="p-10 text-center text-sm text-destructive">
        Erro ao carregar dados. Tente novamente.
      </Card>
    );
  }

  const data = query.data;
  const topSupplier = data?.topSupplier;
  const topProdOfTopSupplier =
    topSupplier && data?.topProductPerSupplier[topSupplier.supplier];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Total vendido (fornecedores)" value={fmtMoney(data?.totalValue ?? 0)} icon={DollarSign} />
        <SummaryCard label="Fornecedores vendidos" value={String(data?.suppliers.length ?? 0)} icon={Factory} />
        <SummaryCard
          label="Maior faturamento"
          value={topSupplier?.supplier ?? "—"}
          icon={Trophy}
          sub={topSupplier ? fmtMoney(topSupplier.value) : undefined}
        />
        <SummaryCard
          label="Produto mais vendido do fornecedor"
          value={topProdOfTopSupplier?.name ?? "—"}
          icon={Package}
          sub={topProdOfTopSupplier ? fmtMoney(topProdOfTopSupplier.value) : undefined}
        />
      </div>

      <Card>
        <div className="p-5 border-b">
          <h3 className="text-base font-semibold text-foreground">Desempenho por fornecedor</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {suppliers.length} fornecedor(es) encontrado(s)
          </p>
        </div>
        {suppliers.length === 0 ? (
          <EmptyResults label="Ajuste os filtros para visualizar dados." />
        ) : (
          <div className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor/Fabricante</TableHead>
                  <TableHead className="text-right">Qtd. produtos vendidos</TableHead>
                  <TableHead className="text-right">Qtd. pedidos</TableHead>
                  <TableHead className="text-right">Valor vendido</TableHead>
                  <TableHead className="text-right">Participação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => (
                  <TableRow key={s.supplier}>
                    <TableCell className="font-medium">{s.supplier}</TableCell>
                    <TableCell className="text-right">{s.quantity}</TableCell>
                    <TableCell className="text-right">{s.orders}</TableCell>
                    <TableCell className="text-right font-medium">{fmtMoney(s.value)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmtPct(s.share)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ProdutosReportView({
  filters,
  search,
}: {
  filters: VendasFilters;
  search: string;
}) {
  const fetchReport = useServerFn(getProdutosFornecedoresReport);
  const query = useQuery({
    queryKey: ["relatorios", "produtos", filters],
    queryFn: () => fetchReport({ data: filters }),
    staleTime: 15_000,
  });

  const products = useMemo(() => {
    const list = query.data?.products ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        (p.code ?? "").toLowerCase().includes(s) ||
        (p.category ?? "").toLowerCase().includes(s) ||
        (p.supplier ?? "").toLowerCase().includes(s),
    );
  }, [query.data, search]);

  if (query.isLoading) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        Carregando relatório de produtos...
      </Card>
    );
  }
  if (query.error) {
    return (
      <Card className="p-10 text-center text-sm text-destructive">
        Erro ao carregar dados. Tente novamente.
      </Card>
    );
  }

  const data = query.data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Produtos vendidos" value={String(data?.totalQuantity ?? 0)} icon={Boxes} />
        <SummaryCard
          label="Produto mais vendido"
          value={data?.topProduct?.name ?? "—"}
          icon={Trophy}
          sub={data?.topProduct ? fmtMoney(data.topProduct.value) : undefined}
        />
        <SummaryCard
          label="Categoria mais vendida"
          value={data?.topCategory?.category ?? "—"}
          icon={Tag}
          sub={data?.topCategory ? fmtMoney(data.topCategory.value) : undefined}
        />
        <SummaryCard label="Valor total em produtos" value={fmtMoney(data?.totalValue ?? 0)} icon={DollarSign} />
      </div>

      <Card>
        <div className="p-5 border-b">
          <h3 className="text-base font-semibold text-foreground">Produtos mais vendidos</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {products.length} produto(s) encontrado(s)
          </p>
        </div>
        {products.length === 0 ? (
          <EmptyResults label="Ajuste os filtros para visualizar dados." />
        ) : (
          <div className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">Qtd. vendida</TableHead>
                  <TableHead className="text-right">Valor vendido</TableHead>
                  <TableHead className="text-right">Nº pedidos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.productId ?? p.code + p.name}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.code || "—"}</TableCell>
                    <TableCell>{p.category}</TableCell>
                    <TableCell>{p.supplier}</TableCell>
                    <TableCell className="text-right">{p.quantity}</TableCell>
                    <TableCell className="text-right font-medium">{fmtMoney(p.value)}</TableCell>
                    <TableCell className="text-right">{p.orders}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// Orçamentos
// ============================================================================

function OrcamentosReportView({
  filters,
  search,
}: {
  filters: OrcamentosFilters;
  search: string;
}) {
  const fetchReport = useServerFn(getOrcamentosReport);
  const query = useQuery({
    queryKey: ["relatorios", "orcamentos", filters],
    queryFn: () => fetchReport({ data: filters }),
    staleTime: 15_000,
  });

  const rows = useMemo(() => {
    const list = query.data?.rows ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (r) =>
        r.number.toLowerCase().includes(s) ||
        r.client_name.toLowerCase().includes(s) ||
        (r.operator_name ?? "").toLowerCase().includes(s) ||
        (r.empresa_name ?? "").toLowerCase().includes(s),
    );
  }, [query.data, search]);

  if (query.isLoading) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        Carregando relatório de orçamentos...
      </Card>
    );
  }
  if (query.error) {
    return (
      <Card className="p-10 text-center text-sm text-destructive">
        Erro ao carregar dados. Tente novamente.
      </Card>
    );
  }

  const data = query.data!;
  const s = data.summary;
  const f = data.funnel;

  const cards = [
    { label: "Total de orçamentos", value: String(s.total), icon: FileText },
    { label: "Valor total orçado", value: fmtMoney(s.valorTotal), icon: DollarSign },
    { label: "Aprovados", value: String(s.aprovados), icon: CheckCircle2 },
    { label: "Pendentes", value: String(s.pendentes), icon: Clock },
    { label: "Cancelados", value: String(s.cancelados), icon: XCircle },
    { label: "Taxa de aprovação", value: fmtPct(s.taxaAprovacao), icon: Percent },
  ];

  const funnelSteps = [
    { label: "Criados", qtd: f.criados.qtd, valor: f.criados.valor },
    { label: "Pendentes", qtd: f.pendentes.qtd, valor: f.pendentes.valor },
    { label: "Aprovados", qtd: f.aprovados.qtd, valor: f.aprovados.valor },
    { label: "Transformados em Pedido", qtd: f.transformados.qtd, valor: f.transformados.valor },
  ];
  const funnelMax = Math.max(1, ...funnelSteps.map((x) => x.qtd));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map((c) => (
          <SummaryCard key={c.label} label={c.label} value={c.value} icon={c.icon} />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Ticket médio" value={fmtMoney(s.ticketMedio)} icon={Receipt} />
        <SummaryCard label="Maior orçamento" value={fmtMoney(s.maior)} icon={Trophy} />
        <SummaryCard label="Menor orçamento" value={fmtMoney(s.menor)} icon={TrendingDown} />
        <SummaryCard
          label="Tempo médio até aprovação"
          value={`${s.tempoMedioAprovacaoDias.toFixed(1)} dias`}
          icon={Clock}
        />
      </div>

      <Card>
        <div className="p-5 border-b">
          <h3 className="text-base font-semibold text-foreground">Evolução no período</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data.evolution.length} ponto(s) agregados
          </p>
        </div>
        <div className="p-4 h-72">
          {data.evolution.length === 0 ? (
            <EmptyResults label="Sem dados no período." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.evolution}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="bucket" fontSize={11} />
                <YAxis fontSize={11} />
                <RTooltip
                  formatter={(v: number, k: string) =>
                    k === "valor" ? fmtMoney(v) : String(v)
                  }
                />
                <Line type="monotone" dataKey="qtd" stroke="hsl(var(--primary))" strokeWidth={2} name="Qtd" />
                <Line type="monotone" dataKey="valor" stroke="hsl(var(--muted-foreground))" strokeWidth={2} name="Valor" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-5 border-b">
          <h3 className="text-base font-semibold text-foreground">Funil Comercial</h3>
        </div>
        <div className="p-5 space-y-3">
          {funnelSteps.map((step, i) => {
            const pct = (step.qtd / funnelMax) * 100;
            return (
              <div key={step.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-foreground">
                    {i + 1}. {step.label}
                  </span>
                  <span className="text-muted-foreground">
                    {step.qtd} • {fmtMoney(step.valor)}
                  </span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-brand"
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="p-5 border-b">
          <h3 className="text-base font-semibold text-foreground">Ranking — Maiores orçamentos</h3>
        </div>
        {data.ranking.length === 0 ? (
          <EmptyResults label="Sem orçamentos no período." />
        ) : (
          <div className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.ranking.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.number}</TableCell>
                    <TableCell>{r.client_name}</TableCell>
                    <TableCell>
                      <span className="inline-flex px-2 py-0.5 rounded-md text-xs bg-muted text-foreground">
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmtMoney(r.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card>
        <div className="p-5 border-b">
          <h3 className="text-base font-semibold text-foreground">Orçamentos</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {rows.length} orçamento(s) encontrado(s)
          </p>
        </div>
        {rows.length === 0 ? (
          <EmptyResults label="Ajuste os filtros para visualizar dados." />
        ) : (
          <div className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.number}</TableCell>
                    <TableCell>{r.client_name}</TableCell>
                    <TableCell>{r.operator_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.empresa_name ?? "—"}</TableCell>
                    <TableCell>
                      <span className="inline-flex px-2 py-0.5 rounded-md text-xs bg-muted text-foreground">
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmtMoney(r.total_value)}</TableCell>
                    <TableCell>{fmtDateTime(r.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// Clientes
// ============================================================================

function ClientesReportView({
  filters,
  search,
}: {
  filters: ClientesFilters;
  search: string;
}) {
  const fetchReport = useServerFn(getClientesReport);
  const query = useQuery({
    queryKey: ["relatorios", "clientes", filters],
    queryFn: () => fetchReport({ data: filters }),
    staleTime: 15_000,
  });

  const rows = useMemo(() => {
    const list = query.data?.rows ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        (r.city ?? "").toLowerCase().includes(s),
    );
  }, [query.data, search]);

  if (query.isLoading) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        Carregando relatório de clientes...
      </Card>
    );
  }
  if (query.error) {
    return (
      <Card className="p-10 text-center text-sm text-destructive">
        Erro ao carregar dados. Tente novamente.
      </Card>
    );
  }

  const data = query.data!;
  const s = data.summary;

  const cards = [
    { label: "Total de clientes", value: String(s.totalClientes), icon: Users },
    { label: "Clientes ativos", value: String(s.ativos), icon: CheckCircle2 },
    { label: "Clientes inativos", value: String(s.inativos), icon: XCircle },
    { label: "Novos no período", value: String(s.novosNoPeriodo), icon: UserPlus },
    { label: "Ticket médio", value: fmtMoney(s.ticketMedio), icon: Receipt },
    { label: "Valor total vendido", value: fmtMoney(s.valorTotal), icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map((c) => (
          <SummaryCard key={c.label} label={c.label} value={c.value} icon={c.icon} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ClienteRankingCard title="Top por faturamento" icon={DollarSign} rows={data.topFaturamento} valueKey="valorComprado" />
        <ClienteRankingCard title="Top por pedidos" icon={ShoppingCart} rows={data.topPedidos} valueKey="qtdPedidos" />
        <ClienteRankingCard title="Top por orçamentos" icon={FileText} rows={data.topOrcamentos} valueKey="qtdOrcamentos" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <IndicatorListCard
          title={`Sem comprar há +${data.inactivityDays} dias`}
          icon={Clock}
          items={data.semComprar.map((r) => ({
            label: r.name,
            sub: r.ultimaCompra ? `Última: ${fmtDateTime(r.ultimaCompra)}` : "Nunca comprou",
          }))}
        />
        <IndicatorListCard
          title="Clientes recorrentes (mais de 1 pedido)"
          icon={Repeat}
          items={data.recorrentes.map((r) => ({
            label: r.name,
            sub: `${r.qtdPedidos} pedidos • ${fmtMoney(r.valorComprado)}`,
          }))}
        />
        <IndicatorListCard
          title="Novos no período"
          icon={UserPlus}
          items={data.novos.map((r) => ({
            label: r.name,
            sub: `Cadastro: ${fmtDateTime(r.createdAt)}`,
          }))}
        />
        <IndicatorListCard
          title="Que mais cresceram"
          icon={TrendingUp}
          items={data.maisCresceram.map((r) => ({
            label: r.name,
            sub: `${fmtMoney(r.valorComprado)} no total`,
          }))}
        />
      </div>

      <Card>
        <div className="p-5 border-b">
          <h3 className="text-base font-semibold text-foreground">Clientes</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {rows.length} cliente(s) encontrado(s)
          </p>
        </div>
        {rows.length === 0 ? (
          <EmptyResults label="Ajuste os filtros para visualizar dados." />
        ) : (
          <div className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Orçamentos</TableHead>
                  <TableHead className="text-right">Valor comprado</TableHead>
                  <TableHead>Última compra</TableHead>
                  <TableHead className="text-right">Ticket médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.city ? `${r.city}${r.state ? "/" + r.state : ""}` : "—"}
                    </TableCell>
                    <TableCell className="text-right">{r.qtdPedidos}</TableCell>
                    <TableCell className="text-right">{r.qtdOrcamentos}</TableCell>
                    <TableCell className="text-right font-medium">{fmtMoney(r.valorComprado)}</TableCell>
                    <TableCell>{r.ultimaCompra ? fmtDateTime(r.ultimaCompra) : "—"}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.ticketMedio)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ClienteRankingCard({
  title,
  icon: Icon,
  rows,
  valueKey,
}: {
  title: string;
  icon: typeof BarChart3;
  rows: Array<{ id: string; name: string; valorComprado: number; qtdPedidos: number; qtdOrcamentos: number }>;
  valueKey: "valorComprado" | "qtdPedidos" | "qtdOrcamentos";
}) {
  return (
    <Card>
      <div className="p-4 border-b flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-gradient-brand text-brand-foreground grid place-items-center shadow-brand">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground text-center">Sem dados.</div>
      ) : (
        <ul className="divide-y">
          {rows.map((r, i) => {
            const val = r[valueKey];
            return (
              <li key={r.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-xs w-5 text-muted-foreground">{i + 1}</span>
                  <span className="text-sm font-medium truncate">{r.name}</span>
                </div>
                <span className="text-sm font-semibold text-foreground shrink-0">
                  {valueKey === "valorComprado" ? fmtMoney(val) : String(val)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function IndicatorListCard({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof BarChart3;
  items: { label: string; sub: string }[];
}) {
  return (
    <Card>
      <div className="p-4 border-b flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-gradient-brand text-brand-foreground grid place-items-center shadow-brand">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground text-center">Sem registros.</div>
      ) : (
        <ul className="divide-y">
          {items.map((it, i) => (
            <li key={i} className="p-3">
              <div className="text-sm font-medium text-foreground truncate">{it.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{it.sub}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
