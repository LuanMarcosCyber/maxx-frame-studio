import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { useAuth } from "@/hooks/useAuth";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

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

interface ReportCard {
  key: ReportKey;
  title: string;
  description: string;
  icon: typeof BarChart3;
  adminOnly?: boolean;
}

const REPORT_CARDS: ReportCard[] = [
  {
    key: "vendas",
    title: "Vendas",
    description: "Analise faturamento, pedidos e desempenho de vendas.",
    icon: TrendingUp,
  },
  {
    key: "orcamentos",
    title: "Orçamentos",
    description: "Consulte orçamentos criados, aprovados e pendentes.",
    icon: FileText,
  },
  {
    key: "produtos",
    title: "Produtos",
    description: "Veja utilização, vendas e desempenho dos produtos.",
    icon: Package,
  },
  {
    key: "fornecedores",
    title: "Fornecedores",
    description: "Analise quanto cada fornecedor representa nas vendas.",
    icon: Factory,
  },
  {
    key: "clientes",
    title: "Clientes",
    description: "Consulte histórico e ranking dos clientes.",
    icon: Users,
  },
  {
    key: "colaboradores",
    title: "Colaboradores",
    description: "Acompanhe produtividade, descontos e desempenho.",
    icon: UserCog,
  },
  {
    key: "empresas",
    title: "Empresas",
    description: "Visualize indicadores das empresas/revendedores.",
    icon: Building2,
    adminOnly: true,
  },
];

function Relatorios() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [selected, setSelected] = useState<ReportKey | null>(null);
  const [period, setPeriod] = useState<string>("mes");
  const [status, setStatus] = useState<string>("todos");
  const [search, setSearch] = useState("");

  const visibleCards = REPORT_CARDS.filter((c) => !c.adminOnly || isAdmin);

  return (
    <AppShell
      title="Relatórios"
      subtitle="Consulte informações, acompanhe indicadores e pesquise qualquer dado cadastrado no sistema."
    >
      <div className="space-y-8">
        {/* Pesquisa global */}
        <Card className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar cliente, pedido, orçamento, produto, fornecedor, colaborador..."
              className="pl-11 h-12 text-base"
            />
          </div>
        </Card>

        {/* Seleção de relatório */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            O que você deseja analisar?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleCards.map((c) => {
              const Icon = c.icon;
              const active = selected === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setSelected(c.key)}
                  className={cn(
                    "group text-left rounded-xl border bg-card p-5 shadow-sm cursor-pointer transition-all",
                    "hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40",
                    active && "border-primary ring-1 ring-primary shadow-md",
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        "h-11 w-11 rounded-lg grid place-items-center shrink-0 transition-colors",
                        active
                          ? "bg-gradient-brand text-brand-foreground shadow-brand"
                          : "bg-muted text-foreground group-hover:bg-gradient-brand group-hover:text-brand-foreground",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground">{c.title}</div>
                      <div className="text-sm text-muted-foreground mt-1 leading-snug">
                        {c.description}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Filtros */}
        <section>
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">Filtros</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label>Período</Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hoje">Hoje</SelectItem>
                    <SelectItem value="ontem">Ontem</SelectItem>
                    <SelectItem value="semana">Esta semana</SelectItem>
                    <SelectItem value="mes">Este mês</SelectItem>
                    <SelectItem value="ano">Este ano</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="aprovado">Aprovado</SelectItem>
                    <SelectItem value="producao">Produção</SelectItem>
                    <SelectItem value="finalizado">Finalizado</SelectItem>
                    <SelectItem value="entregue">Entregue</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select disabled>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Fornecedor</Label>
                <Select disabled>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Produto</Label>
                <Select disabled>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select disabled>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Colaborador</Label>
                <Select disabled>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>

              {isAdmin && (
                <div className="space-y-1.5">
                  <Label>Empresa</Label>
                  <Select disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </div>
              )}
            </div>
          </Card>
        </section>

        {/* Resultados */}
        <section>
          <ReportResults selected={selected} />
        </section>
      </div>
    </AppShell>
  );
}

function ReportResults({ selected }: { selected: ReportKey | null }) {
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
