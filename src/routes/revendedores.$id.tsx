import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye, MoreHorizontal, Image as ImageIcon } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { cn, fmtDateBR } from "@/lib/utils";
import {
  getResellerInfo,
  listResellerProducts,
  listResellerBudgets,
  getResellerBudgetItems,
  listResellerOrders,
  listResellerCollaborators,
} from "@/lib/admin-reseller.functions";

export const Route = createFileRoute("/revendedores/$id")({
  head: () => ({ meta: [{ title: "Detalhes do revendedor — Total Maxx" }] }),
  component: ResellerDetailPage,
});

const CATEGORIES = ["Foam", "Paspatur", "Impressão", "Perfil", "Vidro", "Colagem"] as const;
type Category = (typeof CATEGORIES)[number];

const fmtMoney = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (n: number) => `${Number(n).toLocaleString("pt-BR")}%`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");

const statusBudgetStyle: Record<string, string> = {
  Aprovado: "bg-emerald-100 text-emerald-700",
  Pendente: "bg-amber-100 text-amber-700",
  Recusado: "bg-red-100 text-red-700",
};
const statusOrderStyle: Record<string, string> = {
  "Em produção": "bg-blue-100 text-blue-700",
  Entregue: "bg-emerald-100 text-emerald-700",
  Aguardando: "bg-amber-100 text-amber-700",
};

function ResellerDetailPage() {
  const { id } = Route.useParams();
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && role && role !== "admin") {
      navigate({ to: "/", replace: true });
    }
  }, [role, loading, navigate]);

  const getInfo = useServerFn(getResellerInfo);
  const { data: info } = useQuery({
    queryKey: ["admin", "reseller", id, "info"],
    enabled: role === "admin",
    queryFn: () => getInfo({ data: { reseller_id: id } }),
  });

  if (loading || !role) {
    return (
      <AppShell title="Revendedor" subtitle="Carregando...">
        <div className="text-sm text-muted-foreground">Carregando...</div>
      </AppShell>
    );
  }
  if (role !== "admin") return null;

  const title = info?.full_name || "Revendedor";
  const subtitle = info?.username ? `@${info.username}` : "Visualização administrativa";

  return (
    <AppShell title={title} subtitle={subtitle}>
      <div className="mb-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/revendedores">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar para Revendedores
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="produtos" className="w-full">
        <div className="-mx-4 sm:mx-0 overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="produtos" className="whitespace-nowrap">Produtos</TabsTrigger>
            <TabsTrigger value="orcamentos" className="whitespace-nowrap">Orçamentos</TabsTrigger>
            <TabsTrigger value="pedidos" className="whitespace-nowrap">Pedidos</TabsTrigger>
            <TabsTrigger value="colaboradores" className="whitespace-nowrap">Colaboradores</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="produtos" className="mt-4">
          <ProdutosTab resellerId={id} />
        </TabsContent>
        <TabsContent value="orcamentos" className="mt-4">
          <OrcamentosTab resellerId={id} />
        </TabsContent>
        <TabsContent value="pedidos" className="mt-4">
          <PedidosTab resellerId={id} />
        </TabsContent>
        <TabsContent value="colaboradores" className="mt-4">
          <ColaboradoresTab resellerId={id} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="py-8 text-center text-muted-foreground">
        Nenhum registro encontrado.
      </td>
    </tr>
  );
}

function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="py-8 text-center text-muted-foreground">
        Carregando...
      </td>
    </tr>
  );
}

// ============ PRODUTOS ============
function ProdutosTab({ resellerId }: { resellerId: string }) {
  const list = useServerFn(listResellerProducts);
  const [activeCategory, setActiveCategory] = useState<Category>("Foam");
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "reseller", resellerId, "products"],
    queryFn: () => list({ data: { reseller_id: resellerId } }),
  });

  const filtered = rows.filter((r) => (r.category ?? "") === activeCategory);

  return (
    <>
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                activeCategory === c
                  ? "bg-gradient-brand text-brand-foreground border-transparent shadow-brand"
                  : "bg-background text-foreground border-border hover:bg-accent",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">{activeCategory}</h2>
          <p className="text-xs text-muted-foreground">
            {filtered.length} produto{filtered.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
                <th className="font-medium py-3 px-6">Código</th>
                <th className="font-medium py-3 px-3">Descrição</th>
                <th className="font-medium py-3 px-3">Valor/m</th>
                <th className="font-medium py-3 px-3">Margem</th>
                <th className="font-medium py-3 px-6">Perda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <LoadingRow cols={5} />
              ) : filtered.length === 0 ? (
                <EmptyRow cols={5} />
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40 transition">
                    <td className="py-3.5 px-6 font-mono font-semibold">{p.code}</td>
                    <td className="py-3.5 px-3">{p.description}</td>
                    <td className="py-3.5 px-3 font-semibold">
                      {fmtMoney(Number(p.value_per_meter))}
                    </td>
                    <td className="py-3.5 px-3 text-muted-foreground">
                      {fmtPct(Number(p.profit_margin))}
                    </td>
                    <td className="py-3.5 px-6 text-muted-foreground">
                      {fmtPct(Number(p.waste_percentage))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ============ ORÇAMENTOS ============
type BudgetRow = {
  id: string;
  number: string;
  client_name: string;
  total_value: number;
  status: string;
  created_at: string;
  data_vencimento: string | null;
  details: Record<string, unknown> | null;
};

function OrcamentosTab({ resellerId }: { resellerId: string }) {
  const list = useServerFn(listResellerBudgets);
  const [viewing, setViewing] = useState<BudgetRow | null>(null);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "reseller", resellerId, "budgets"],
    queryFn: () => list({ data: { reseller_id: resellerId } }),
  });

  return (
    <Card className="p-6">
      <div className="overflow-x-auto -mx-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
              <th className="font-medium py-3 px-6">Número</th>
              <th className="font-medium py-3 px-3">Cliente</th>
              <th className="font-medium py-3 px-3">Data</th>
              <th className="font-medium py-3 px-3">Valor total</th>
              <th className="font-medium py-3 px-3">Status</th>
              <th className="font-medium py-3 px-6 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <LoadingRow cols={6} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={6} />
            ) : (
              rows.map((b) => (
                <tr key={b.id} className="hover:bg-muted/40 transition">
                  <td className="py-3.5 px-6 font-mono font-semibold">{b.number}</td>
                  <td className="py-3.5 px-3">{b.client_name}</td>
                  <td className="py-3.5 px-3 text-muted-foreground">
                    {fmtDate(b.created_at)}
                  </td>
                  <td className="py-3.5 px-3 font-semibold">
                    {fmtMoney(Number(b.total_value))}
                  </td>
                  <td className="py-3.5 px-3">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        statusBudgetStyle[b.status] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent transition"
                          aria-label="Ações"
                        >
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setViewing(b as BudgetRow)}>
                          <Eye className="h-4 w-4 mr-2" /> Visualizar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ResumoDialog
        resellerId={resellerId}
        budget={viewing}
        onClose={() => setViewing(null)}
      />
    </Card>
  );
}

// ============ PEDIDOS ============
function PedidosTab({ resellerId }: { resellerId: string }) {
  const list = useServerFn(listResellerOrders);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "reseller", resellerId, "orders"],
    queryFn: () => list({ data: { reseller_id: resellerId } }),
  });

  return (
    <Card className="p-6">
      <div className="overflow-x-auto -mx-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
              <th className="font-medium py-3 px-6">Pedido</th>
              <th className="font-medium py-3 px-3">Cliente</th>
              <th className="font-medium py-3 px-3">Data</th>
              <th className="font-medium py-3 px-3">Valor total</th>
              <th className="font-medium py-3 px-6">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <LoadingRow cols={5} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={5} />
            ) : (
              rows.map((o) => (
                <tr key={o.id} className="hover:bg-muted/40 transition">
                  <td className="py-3.5 px-6 font-mono font-semibold">{o.number}</td>
                  <td className="py-3.5 px-3">{o.client_name}</td>
                  <td className="py-3.5 px-3 text-muted-foreground">
                    {fmtDate(o.created_at)}
                  </td>
                  <td className="py-3.5 px-3 font-semibold">
                    {fmtMoney(Number(o.total_value))}
                  </td>
                  <td className="py-3.5 px-6">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        statusOrderStyle[o.status] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============ COLABORADORES ============
function ColaboradoresTab({ resellerId }: { resellerId: string }) {
  const list = useServerFn(listResellerCollaborators);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "reseller", resellerId, "collaborators"],
    queryFn: () => list({ data: { reseller_id: resellerId } }),
  });

  return (
    <Card className="p-6">
      <div className="overflow-x-auto -mx-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
              <th className="font-medium py-3 px-6">Nome</th>
              <th className="font-medium py-3 px-3">Usuário</th>
              <th className="font-medium py-3 px-3">Status</th>
              <th className="font-medium py-3 px-6">Criado em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <LoadingRow cols={4} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={4} />
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="hover:bg-muted/40 transition">
                  <td className="py-3.5 px-6 font-medium">{c.full_name || "—"}</td>
                  <td className="py-3.5 px-3 font-mono text-xs">{c.username || "—"}</td>
                  <td className="py-3.5 px-3">
                    {c.active ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </td>
                  <td className="py-3.5 px-6 text-muted-foreground">
                    {fmtDate(c.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============ RESUMO DIALOG ============
type BudgetItemRow = {
  id: string;
  position: number;
  subtotal: number;
  data: Record<string, unknown>;
};

function ResumoDialog({
  resellerId,
  budget,
  onClose,
}: {
  resellerId: string;
  budget: BudgetRow | null;
  onClose: () => void;
}) {
  const getItems = useServerFn(getResellerBudgetItems);
  const general = (budget?.details ?? {}) as Record<string, unknown>;
  const gStr = (k: string) => (typeof general[k] === "string" ? (general[k] as string) : "");
  const gNum = (k: string) => (typeof general[k] === "number" ? (general[k] as number) : 0);

  const [items, setItems] = useState<BudgetItemRow[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!budget) {
      setItems([]);
      setActiveIdx(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getItems({
          data: { reseller_id: resellerId, budget_id: budget.id },
        });
        if (cancelled) return;
        let rows = (data ?? []) as BudgetItemRow[];
        if (rows.length === 0) {
          rows = [
            {
              id: budget.id,
              position: 1,
              subtotal: Number(budget.total_value),
              data: general,
            },
          ];
        }
        setItems(rows);
        setActiveIdx(0);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget?.id]);

  const tipoEntrega = gStr("tipoEntrega") || "Retirada";
  const instalacaoAtivo = general.instalacaoAtivo === "sim";
  const entregaAtiva = tipoEntrega !== "Retirada";

  const moneyOrNA = (active: boolean, value: number) =>
    !active ? "Não aplicado" : fmtMoney(value);
  const productLabel = (d: Record<string, unknown>, code: string, desc: string) => {
    const c = typeof d[code] === "string" ? (d[code] as string) : "";
    const dd = typeof d[desc] === "string" ? (d[desc] as string) : "";
    if (!c && !dd) return "Não aplicado";
    return `${c}${c && dd ? " — " : ""}${dd}`;
  };
  const dNum = (d: Record<string, unknown>, k: string) =>
    typeof d[k] === "number" ? (d[k] as number) : 0;

  const activeItem = items[activeIdx];
  const d = (activeItem?.data ?? {}) as Record<string, unknown>;
  const paspaturAtivo = d.paspaturAtivo === "sim";
  const vidroAtivo = d.vidroTipo === "sim";
  const colagemAtivo = d.colagemAtivo === "sim";
  const impressaoAtivo = d.impressaoAtivo === "sim";

  const itemRows: { label: string; value: string; sub?: string }[] = activeItem
    ? [
        {
          label: "Tamanho original",
          value: `${dNum(d, "larguraOriginal")} × ${dNum(d, "alturaOriginal")} cm`,
        },
        {
          label: "Tamanho final",
          value: `${dNum(d, "larguraFinal")} × ${dNum(d, "alturaFinal")} cm`,
        },
        {
          label: "Paspatur",
          value: moneyOrNA(paspaturAtivo, dNum(d, "valorPaspatur")),
          sub: paspaturAtivo ? productLabel(d, "paspaturCode", "paspaturDescription") : undefined,
        },
        {
          label: "Perfil",
          value: fmtMoney(dNum(d, "valorPerfil")),
          sub: productLabel(d, "perfilCode", "perfilDescription"),
        },
        {
          label: "Vidro / Espelho",
          value: moneyOrNA(vidroAtivo, dNum(d, "valorVidro")),
          sub: vidroAtivo ? productLabel(d, "vidroCode", "vidroDescription") : undefined,
        },
        {
          label: "Foam / MDF",
          value: fmtMoney(dNum(d, "valorFoam")),
          sub: productLabel(d, "foamCode", "foamDescription"),
        },
        {
          label: "Colagem",
          value: moneyOrNA(colagemAtivo, dNum(d, "valorColagem")),
          sub: colagemAtivo ? productLabel(d, "colagemCode", "colagemDescription") : undefined,
        },
        {
          label: "Impressão",
          value: moneyOrNA(impressaoAtivo, dNum(d, "valorImpressao")),
          sub: impressaoAtivo
            ? productLabel(d, "impressaoCode", "impressaoDescription")
            : undefined,
        },
      ]
    : [];

  return (
    <Dialog open={!!budget} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resumo</DialogTitle>
        </DialogHeader>
        {budget && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Info label="Número" value={budget.number} mono />
              <Info label="Cliente" value={budget.client_name} />
              <Info label="Data" value={fmtDate(budget.created_at)} />
              <Info label="Status" value={budget.status} />
              <Info label="Forma de pagamento" value={gStr("formaPagamento") || "—"} />
              <Info
                label="Vencimento"
                value={budget.data_vencimento ? fmtDateBR(budget.data_vencimento) : "—"}
              />
            </div>

            {items.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {items.map((it, i) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      i === activeIdx
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-accent",
                    )}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Item {i + 1}
                    <span className="text-muted-foreground font-normal">
                      {fmtMoney(Number(it.subtotal))}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {activeItem && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Item {activeIdx + 1}
                </div>
                <div className="rounded-lg border border-border divide-y divide-border">
                  {itemRows.map((r) => (
                    <div
                      key={r.label}
                      className="flex items-start justify-between px-4 py-3 text-sm"
                    >
                      <div>
                        <div className="font-medium text-foreground">{r.label}</div>
                        {r.sub && (
                          <div className="text-xs text-muted-foreground mt-0.5">{r.sub}</div>
                        )}
                      </div>
                      <div className="font-semibold text-foreground whitespace-nowrap ml-4">
                        {r.value}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-3 text-sm bg-muted/30">
                    <span className="font-semibold text-foreground">
                      Subtotal Item {activeIdx + 1}
                    </span>
                    <span className="font-semibold">{fmtMoney(Number(activeItem.subtotal))}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border divide-y divide-border">
              {items.length > 1 &&
                items.map((it, i) =>
                  i === activeIdx ? null : (
                    <div
                      key={it.id}
                      className="flex items-center justify-between px-4 py-3 text-sm"
                    >
                      <span className="font-medium text-foreground">Item {i + 1}</span>
                      <span className="font-semibold">{fmtMoney(Number(it.subtotal))}</span>
                    </div>
                  ),
                )}
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted-foreground">Instalação</span>
                <span className="font-semibold">
                  {moneyOrNA(instalacaoAtivo, gNum("valorInstalacao"))}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  Entrega / Frete ({tipoEntrega})
                </span>
                <span className="font-semibold">
                  {moneyOrNA(entregaAtiva, gNum("valorEntrega"))}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted-foreground">Mão de obra extra</span>
                <span className="font-semibold">{fmtMoney(gNum("maoDeObraExtra"))}</span>
              </div>
            </div>

            {gStr("observacoes") && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Observações
                </div>
                <div className="text-sm text-foreground whitespace-pre-wrap rounded-md border border-border p-3 bg-muted/30">
                  {gStr("observacoes")}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg bg-gradient-brand text-brand-foreground px-5 py-4 shadow-brand">
              <span className="text-sm font-medium">Total geral</span>
              <span className="text-xl font-bold">{fmtMoney(Number(budget.total_value))}</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-foreground font-medium ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
