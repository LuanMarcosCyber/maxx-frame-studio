import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, MoreHorizontal, Eye, Pencil, Trash2, Image as ImageIcon, Check } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/orcamentos/")({
  head: () => ({ meta: [{ title: "Orçamentos — Total Maxx ERP" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    view: typeof search.view === "string" ? search.view : undefined,
  }),
  component: Orcamentos,
});

const statusStyle: Record<string, string> = {
  Aprovado: "bg-emerald-100 text-emerald-700",
  Pendente: "bg-amber-100 text-amber-700",
  Recusado: "bg-red-100 text-red-700",
};

const fmtMoney = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");

type BudgetRow = {
  id: string;
  number: string;
  client_name: string;
  client_id: string | null;
  total_value: number;
  status: string;
  created_at: string;
  data_vencimento: string | null;
  details: Record<string, unknown> | null;
};

function Orcamentos() {
  const { session, ownerUserId } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { view: viewParam } = Route.useSearch();

  const [viewing, setViewing] = useState<BudgetRow | null>(null);
  const [deleting, setDeleting] = useState<BudgetRow | null>(null);
  const [approving, setApproving] = useState<BudgetRow | null>(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const [clientMissingOpen, setClientMissingOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["budgets", "pending"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("id, number, client_name, client_id, total_value, status, created_at, data_vencimento, details")
        .neq("status", "Aprovado")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BudgetRow[];
    },
  });

  // Abrir automaticamente o resumo quando vindo de /pedidos?view=<id>
  useEffect(() => {
    if (!viewParam) return;
    const found = rows.find((r) => r.id === viewParam);
    if (found) {
      setViewing(found);
      navigate({ to: "/orcamentos", search: {}, replace: true });
    }
  }, [viewParam, rows, navigate]);

  async function handleDelete() {
    if (!deleting) return;
    const { error } = await supabase.from("budgets").delete().eq("id", deleting.id);
    if (error) {
      toast.error("Não foi possível excluir o orçamento.");
      return;
    }
    toast.success("Orçamento excluído.");
    setDeleting(null);
    await queryClient.invalidateQueries({ queryKey: ["budgets"] });
    await queryClient.invalidateQueries({ queryKey: ["budgets", "pending"] });
  }

  async function handleApprove() {
    if (!approving || !session?.user?.id) return;
    setApproveLoading(true);
    try {
      const { error: updErr } = await supabase
        .from("budgets")
        .update({ status: "Aprovado" })
        .eq("id", approving.id);
      if (updErr) throw updErr;

      const { data: existingOrder } = await supabase
        .from("orders")
        .select("id")
        .eq("budget_id", approving.id)
        .maybeSingle();

      const orderPayload = {
        client_name: approving.client_name,
        total_value: Number(approving.total_value),
        status: "Aprovado",
      };
      if (existingOrder?.id) {
        const { error: upoErr } = await supabase
          .from("orders")
          .update(orderPayload)
          .eq("id", existingOrder.id);
        if (upoErr) throw upoErr;
      } else {
        const orderNumber = approving.number
          ? `PED-${approving.number.replace(/^ORC-/, "")}`
          : `PED-${Date.now().toString().slice(-8)}`;
        const { error: insErr } = await supabase.from("orders").insert({
          user_id: ownerUserId ?? session.user.id,
          number: orderNumber,
          budget_id: approving.id,
          ...orderPayload,
        });
        if (insErr) throw insErr;
      }

      toast.success("Orçamento aprovado e movido para Pedidos.");
      setApproving(null);
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      await queryClient.invalidateQueries({ queryKey: ["budgets", "pending"] });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível aprovar o orçamento.");
    } finally {
      setApproveLoading(false);
    }
  }

  function tryApprove(b: BudgetRow) {
    if (!b.client_id) {
      toast.warning("Para aprovar este orçamento, selecione ou cadastre um cliente.");
      return;
    }
    setApproving(b);
  }


  return (
    <AppShell title="Orçamentos" subtitle="Gerencie todos os orçamentos da sua revenda">
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
          <div className="relative w-full sm:max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por cliente ou número..." className="pl-9" />
          </div>
          <Button asChild className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand">
            <Link to="/orcamentos/novo">
              <Plus className="h-4 w-4 mr-1.5" /> Novo Orçamento
            </Link>
          </Button>
        </div>

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
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhum orçamento cadastrado.
                  </td>
                </tr>
              ) : (
                rows.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/40 transition">
                    <td className="py-3.5 px-6 font-mono font-semibold text-foreground">
                      {b.number}
                    </td>
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
                          statusStyle[b.status] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => tryApprove(b)}
                          title={
                            b.client_id
                              ? "Aprovar orçamento"
                              : "Selecione um cliente cadastrado para aprovar"
                          }
                          aria-label="Aprovar orçamento"
                          className="h-8 w-8 grid place-items-center rounded-md bg-muted text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700 transition"
                        >
                          <Check className="h-4 w-4" />
                        </button>
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
                            <DropdownMenuItem onClick={() => setViewing(b)}>
                              <Eye className="h-4 w-4 mr-2" /> Visualizar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                navigate({
                                  to: "/orcamentos/novo",
                                  search: { id: b.id },
                                })
                              }
                            >
                              <Pencil className="h-4 w-4 mr-2" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleting(b)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ResumoDialog budget={viewing} onClose={() => setViewing(null)} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir orçamento</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente excluir este orçamento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!approving} onOpenChange={(o) => !o && !approveLoading && setApproving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar orçamento</AlertDialogTitle>
            <AlertDialogDescription>
              Quer aprovar este orçamento? Ele será movido para Pedidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approveLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleApprove();
              }}
              disabled={approveLoading}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {approveLoading ? "Aprovando..." : "Aprovar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

export function BudgetSummaryById({
  budgetId,
  onClose,
}: {
  budgetId: string | null;
  onClose: () => void;
}) {
  const [budget, setBudget] = useState<BudgetRow | null>(null);

  useEffect(() => {
    if (!budgetId) {
      setBudget(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("budgets")
        .select(
          "id, number, client_name, client_id, total_value, status, created_at, data_vencimento, details",
        )
        .eq("id", budgetId)
        .maybeSingle();
      if (!cancelled) setBudget((data as BudgetRow | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [budgetId]);

  return <ResumoDialog budget={budget} onClose={onClose} />;
}


type BudgetItemRow = {
  id: string;
  position: number;
  subtotal: number;
  data: Record<string, unknown>;
};

function ResumoDialog({
  budget,
  onClose,
}: {
  budget: BudgetRow | null;
  onClose: () => void;
}) {
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
      const { data } = await supabase
        .from("budget_items")
        .select("id, position, subtotal, data")
        .eq("budget_id", budget.id)
        .order("position", { ascending: true });
      if (cancelled) return;
      let rows = (data ?? []) as BudgetItemRow[];
      if (rows.length === 0) {
        // Legacy fallback: treat budget.details as Item 1
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
    })();
    return () => {
      cancelled = true;
    };
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

  const itemRows: { label: string; value: string; sub?: string; key?: string }[] = activeItem
    ? [
        {
          label: "Tamanho original",
          value: `${dNum(d, "larguraOriginal")} × ${dNum(d, "alturaOriginal")} cm`,
        },
        {
          label: "Tamanho final",
          value: `${dNum(d, "larguraFinal")} × ${dNum(d, "alturaFinal")} cm`,
        },
        ...(d.paspaturAdicionalAtivo === "sim" && paspaturAtivo
          ? [
              {
                label: "Paspatur principal",
                value: moneyOrNA(paspaturAtivo, dNum(d, "valorPaspaturPrincipal")),
                sub: productLabel(d, "paspaturCode", "paspaturDescription"),
              },
              {
                label: "Paspatur adicional",
                value: fmtMoney(dNum(d, "valorPaspaturAdicional")),
                sub: (() => {
                  const code = productLabel(d, "paspaturAdicionalCode", "paspaturAdicionalDescription");
                  const obs = typeof d.paspaturAdicionalObs === "string" ? d.paspaturAdicionalObs : "";
                  return obs ? `${code} · ${obs}` : code;
                })(),
              },
              {
                label: "Total Paspatur",
                value: fmtMoney(dNum(d, "valorPaspatur")),
              },
            ]
          : [
              {
                label: "Paspatur",
                value: moneyOrNA(paspaturAtivo, dNum(d, "valorPaspatur")),
                sub: paspaturAtivo ? productLabel(d, "paspaturCode", "paspaturDescription") : undefined,
              },
            ]),
        ...(d.perfilAdicionalAtivo === "sim"
          ? [
              {
                label: "Perfil principal",
                value: fmtMoney(dNum(d, "valorPerfilPrincipal")),
                sub: productLabel(d, "perfilCode", "perfilDescription"),
              },
              {
                label: "Perfil adicional",
                value: fmtMoney(dNum(d, "valorPerfilAdicional")),
                sub: `${productLabel(d, "perfilAdicionalCode", "perfilAdicionalDescription")} · medida ${dNum(d, "larguraPerfilAdicional")} × ${dNum(d, "alturaPerfilAdicional")} cm`,
              },
              {
                label: "Total Perfil",
                value: fmtMoney(dNum(d, "valorPerfil")),
              },
            ]
          : [
              {
                label: "Perfil",
                value: fmtMoney(dNum(d, "valorPerfil")),
                sub: productLabel(d, "perfilCode", "perfilDescription"),
              },
            ]),
        {
          label: "Vidro / Espelho",
          value: moneyOrNA(vidroAtivo, dNum(d, "valorVidro")),
          sub: vidroAtivo
            ? (() => {
                const base = productLabel(d, "vidroCode", "vidroDescription");
                const qtd = Number(d.vidroQuantidade) || 1;
                const unit = Number(d.valorVidroUnit) || 0;
                return qtd > 1
                  ? `${base} · ${qtd}× ${fmtMoney(unit)}`
                  : base;
              })()
            : undefined,
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
          sub: impressaoAtivo ? productLabel(d, "impressaoCode", "impressaoDescription") : undefined,
        },
        ...(Array.isArray(d.produtosDiversos) && (d.produtosDiversos as unknown[]).length > 0
          ? [
              ...(d.produtosDiversos as Array<Record<string, unknown>>).map((di, i) => {
                const qtd = Number(di.quantidade) || 1;
                const unit = Number(di.valorUnitario) || 0;
                const total = Number(di.total) || unit * qtd;
                const code = typeof di.code === "string" ? di.code : "";
                const nome = typeof di.nome === "string" ? di.nome : "Produto";
                return {
                  label: `${code ? `${code} · ` : ""}${nome}`,
                  value: fmtMoney(total),
                  sub: `${qtd}× ${fmtMoney(unit)}`,
                  key: `div-${i}`,
                };
              }),
              {
                label: "Total Produtos Diversos",
                value: fmtMoney(dNum(d, "valorDiversos")),
              },
            ]
          : []),
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
              <Info
                label="Forma de pagamento"
                value={gStr("formaPagamento") || "—"}
              />
              <Info
                label="Vencimento"
                value={budget.data_vencimento ? fmtDate(budget.data_vencimento) : "—"}
              />
            </div>

            {/* Item chips */}
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
                  {itemRows.map((r, i) => (
                    <div
                      key={r.key ?? `${r.label}-${i}`}
                      className="flex items-start justify-between px-4 py-3 text-sm"
                    >
                      <div>
                        <div className="font-medium text-foreground">{r.label}</div>
                        {r.sub && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {r.sub}
                          </div>
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
                    <span className="font-semibold">
                      {fmtMoney(Number(activeItem.subtotal))}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Outros itens + extras gerais */}
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
              <span className="text-xl font-bold">
                {fmtMoney(Number(budget.total_value))}
              </span>
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
