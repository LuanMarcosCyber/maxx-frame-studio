import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, MoreHorizontal, Eye, Pencil, Trash2, Image as ImageIcon, Check } from "lucide-react";
import { cn, fmtMeasure, fmtDateBR } from "@/lib/utils";

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
  user_id: string;
  created_by: string | null;
};

function collaboratorLabel(row: { user_id: string; created_by: string | null }, names: Map<string, string>) {
  if (!row.created_by || row.created_by === row.user_id) return "—";
  return names.get(row.created_by) || "—";
}

function Orcamentos() {
  const { session, ownerUserId, role } = useAuth();
  const showCollaborator = role !== "colaborador";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { view: viewParam } = Route.useSearch();

  const [viewing, setViewing] = useState<BudgetRow | null>(null);
  const [deleting, setDeleting] = useState<BudgetRow | null>(null);
  const [approving, setApproving] = useState<BudgetRow | null>(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const [clientMissingFor, setClientMissingFor] = useState<BudgetRow | null>(null);
  const [linkingFor, setLinkingFor] = useState<BudgetRow | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [linkSaving, setLinkSaving] = useState(false);
  const [askApproveAfterLink, setAskApproveAfterLink] = useState<BudgetRow | null>(null);

  const { data: clientList = [] } = useQuery({
    queryKey: ["clients", "picker"],
    enabled: !!session && (!!linkingFor),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const filteredClients = useMemo(() => {
    const q = linkSearch.trim().toLowerCase();
    if (!q) return clientList.slice(0, 50);
    return clientList.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 50);
  }, [clientList, linkSearch]);

  async function handleSaveLink() {
    if (!linkingFor || !selectedClient) return;
    setLinkSaving(true);
    try {
      const { error } = await supabase
        .from("budgets")
        .update({ client_id: selectedClient.id, client_name: selectedClient.name })
        .eq("id", linkingFor.id);
      if (error) throw error;
      toast.success("Cliente vinculado ao orçamento.");
      const updated: BudgetRow = { ...linkingFor, client_id: selectedClient.id, client_name: selectedClient.name };
      setLinkingFor(null);
      setSelectedClient(null);
      setLinkSearch("");
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      await queryClient.invalidateQueries({ queryKey: ["budgets", "pending"] });
      setAskApproveAfterLink(updated);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível vincular o cliente.");
    } finally {
      setLinkSaving(false);
    }
  }

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["budgets", "pending"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("id, number, client_name, client_id, total_value, status, created_at, data_vencimento, details, user_id, created_by")
        .neq("status", "Aprovado")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BudgetRow[];
    },
  });

  const creatorIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.created_by).filter((id): id is string => !!id))),
    [rows],
  );
  const { data: creatorNames } = useQuery({
    queryKey: ["profiles", "names", creatorIds],
    enabled: creatorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", creatorIds);
      const map = new Map<string, string>();
      (data ?? []).forEach((p: any) => map.set(p.id, p.full_name || p.username || "—"));
      return map;
    },
  });
  const namesMap = creatorNames ?? new Map<string, string>();

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
        const { data: nextOrd, error: nErr } = await supabase.rpc(
          "next_document_number",
          { _kind: "order" },
        );
        if (nErr) throw nErr;
        const orderNumber = String(nextOrd);
        const { error: insErr } = await supabase.from("orders").insert({
          user_id: ownerUserId ?? session.user.id,
          created_by: approving.created_by ?? session.user.id,
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
      setClientMissingFor(b);
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
                {showCollaborator && (
                  <th className="font-medium py-3 px-6">Colaborador</th>
                )}
                <th className="font-medium py-3 px-3">Número</th>
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
                  <td colSpan={showCollaborator ? 7 : 6} className="py-8 text-center text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={showCollaborator ? 7 : 6} className="py-8 text-center text-muted-foreground">
                    Nenhum orçamento cadastrado.
                  </td>
                </tr>
              ) : (
                rows.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/40 transition">
                    {showCollaborator && (
                      <td className="py-3.5 px-6 text-muted-foreground">
                        {collaboratorLabel(b, namesMap)}
                      </td>
                    )}
                    <td className="py-3.5 px-3 font-mono font-semibold">
                      <button
                        type="button"
                        onClick={() => setViewing(b)}
                        className="text-primary hover:underline"
                      >
                        {b.number}
                      </button>
                    </td>
                    <td className="py-3.5 px-3">
                      <button
                        type="button"
                        onClick={() => setViewing(b)}
                        className="text-foreground hover:text-primary hover:underline text-left"
                      >
                        {b.client_name}
                      </button>
                    </td>
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

      <AlertDialog open={!!clientMissingFor} onOpenChange={(o) => !o && setClientMissingFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cliente não vinculado</AlertDialogTitle>
            <AlertDialogDescription>
              Para aprovar este orçamento e gerar um pedido, selecione ou cadastre um cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const b = clientMissingFor;
                setClientMissingFor(null);
                setSelectedClient(null);
                setLinkSearch("");
                if (b) setLinkingFor(b);
              }}
            >
              Vincular cliente
            </Button>
            <AlertDialogAction onClick={() => setClientMissingFor(null)}>
              Entendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!linkingFor}
        onOpenChange={(o) => {
          if (!o && !linkSaving) {
            setLinkingFor(null);
            setSelectedClient(null);
            setLinkSearch("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Buscar cliente cadastrado"
                className="pl-9 h-11 text-base"
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
              />
            </div>
            {selectedClient && (
              <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                <span className="font-medium text-emerald-800">Selecionado: {selectedClient.name}</span>
                <button
                  type="button"
                  className="text-xs text-emerald-700 underline"
                  onClick={() => setSelectedClient(null)}
                >
                  Trocar
                </button>
              </div>
            )}
            <div className="max-h-64 overflow-y-auto rounded-md border">
              {clientList.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  Nenhum cliente cadastrado. Cadastre este cliente na aba Clientes antes de aprovar.
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
              ) : (
                <ul className="divide-y">
                  {filteredClients.map((c) => {
                    const active = selectedClient?.id === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedClient({ id: c.id, name: c.name })}
                          className={cn(
                            "w-full flex items-center justify-between text-left px-3 py-2.5 text-sm hover:bg-muted",
                            active && "bg-muted",
                          )}
                        >
                          <span>{c.name}</span>
                          {active && <Check className="h-4 w-4 text-emerald-600" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              disabled={linkSaving}
              onClick={() => {
                setLinkingFor(null);
                setSelectedClient(null);
                setLinkSearch("");
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveLink} disabled={!selectedClient || linkSaving}>
              {linkSaving ? "Salvando..." : "Salvar vínculo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!askApproveAfterLink}
        onOpenChange={(o) => !o && setAskApproveAfterLink(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar orçamento agora?</AlertDialogTitle>
            <AlertDialogDescription>
              O cliente foi vinculado. Deseja aprovar este orçamento agora e gerar o pedido?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAskApproveAfterLink(null)}>Não</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const b = askApproveAfterLink;
                setAskApproveAfterLink(null);
                if (b) setApproving(b);
              }}
            >
              Sim, aprovar
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
  extraActions,
  orderNumber,
}: {
  budgetId: string | null;
  onClose: () => void;
  extraActions?: ReactNode;
  orderNumber?: string | null;
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
          "id, number, client_name, client_id, total_value, status, created_at, data_vencimento, details, user_id, created_by",
        )
        .eq("id", budgetId)
        .maybeSingle();
      if (!cancelled) setBudget((data as BudgetRow | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [budgetId]);

  return (
    <ResumoDialog
      budget={budget}
      onClose={onClose}
      extraActions={extraActions}
      orderNumber={orderNumber ?? null}
    />
  );
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
  extraActions,
  orderNumber,
}: {
  budget: BudgetRow | null;
  onClose: () => void;
  extraActions?: ReactNode;
  orderNumber?: string | null;
}) {
  const [linkedOrderNumber, setLinkedOrderNumber] = useState<string | null>(null);
  useEffect(() => {
    if (!budget?.id || orderNumber) {
      setLinkedOrderNumber(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("number")
        .eq("budget_id", budget.id)
        .maybeSingle();
      if (!cancelled) setLinkedOrderNumber((data as { number: string } | null)?.number ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [budget?.id, orderNumber]);
  const general = (budget?.details ?? {}) as Record<string, unknown>;
  const gStr = (k: string) => (typeof general[k] === "string" ? (general[k] as string) : "");
  const gNum = (k: string) => (typeof general[k] === "number" ? (general[k] as number) : 0);

  const [items, setItems] = useState<BudgetItemRow[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [verParcelasOpen, setVerParcelasOpen] = useState(false);

  type Parcela = { numero: number; valor: number; vencimento: string };
  const parcelasList: Parcela[] = Array.isArray(general.parcelas)
    ? (general.parcelas as unknown[])
        .map((p, i) => {
          if (!p || typeof p !== "object") return null;
          const o = p as Record<string, unknown>;
          return {
            numero: typeof o.numero === "number" ? o.numero : i + 1,
            valor: typeof o.valor === "number" ? o.valor : Number(o.valor) || 0,
            vencimento: typeof o.vencimento === "string" ? o.vencimento : "",
          } as Parcela;
        })
        .filter((p): p is Parcela => !!p)
    : [];

  const [creatorName, setCreatorName] = useState<string>("—");
  useEffect(() => {
    if (!budget || !budget.created_by || budget.created_by === budget.user_id) {
      setCreatorName("—");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", budget.created_by!)
        .maybeSingle();
      if (cancelled) return;
      setCreatorName((data as any)?.full_name || (data as any)?.username || "—");
    })();
    return () => { cancelled = true; };
  }, [budget?.created_by, budget?.user_id]);
  const condicaoPagamento =
    typeof general.condicaoPagamento === "string"
      ? (general.condicaoPagamento as string)
      : "À vista";
  const isParcelado = condicaoPagamento === "Parcelado" && parcelasList.length > 0;

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
          value: `${fmtMeasure(dNum(d, "larguraOriginal"))} × ${fmtMeasure(dNum(d, "alturaOriginal"))} cm`,
        },
        {
          label: "Tamanho final",
          value: `${fmtMeasure(dNum(d, "larguraFinal"))} × ${fmtMeasure(dNum(d, "alturaFinal"))} cm`,
        },
        ...(d.paspaturAdicionalAtivo === "sim" && paspaturAtivo
          ? [
              {
                label: "Paspatur externo",
                value: moneyOrNA(paspaturAtivo, dNum(d, "valorPaspaturPrincipal")),
                sub: productLabel(d, "paspaturCode", "paspaturDescription"),
              },
              {
                label: "Paspatur interno",
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
                sub: `${productLabel(d, "perfilAdicionalCode", "perfilAdicionalDescription")} · medida ${fmtMeasure(dNum(d, "larguraPerfilAdicional"))} × ${fmtMeasure(dNum(d, "alturaPerfilAdicional"))} cm`,
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
              {orderNumber ? (
                <>
                  <Info label="Pedido" value={orderNumber} mono />
                  <Info label="Originado do orçamento" value={budget.number} mono />
                </>
              ) : (
                <>
                  <Info label="Número" value={budget.number} mono />
                  {linkedOrderNumber && (
                    <Info label="Pedido gerado" value={linkedOrderNumber} mono />
                  )}
                </>
              )}
              <Info label="Cliente" value={budget.client_name} />
              <Info label="Data" value={fmtDate(budget.created_at)} />
              <Info label="Status" value={budget.status} />
              <Info label="Colaborador" value={creatorName} />
              <Info
                label="Forma de pagamento"
                value={gStr("formaPagamento") || "—"}
              />
              <Info
                label="Condição"
                value={
                  isParcelado ? `Parcelado · ${parcelasList.length}x` : "À vista"
                }
              />
              <Info
                label="Entrega"
                value={gStr("dataEntrega") ? fmtDate(gStr("dataEntrega")) : "—"}
              />
              {!isParcelado && (
                <Info
                  label="Vencimento"
                  value={budget.data_vencimento ? fmtDate(budget.data_vencimento) : "—"}
                />
              )}
            </div>

            {isParcelado && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Parcelas ({parcelasList.length}x)
                  </span>
                  {parcelasList.length > 3 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setVerParcelasOpen(true)}
                    >
                      Ver parcelas
                    </Button>
                  )}
                </div>
                <div className="space-y-1">
                  {parcelasList.slice(0, 3).map((p) => (
                    <div
                      key={p.numero}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-muted-foreground">
                        {p.numero}/{parcelasList.length} ·{" "}
                        {p.vencimento
                          ? fmtDate(p.vencimento)
                          : "—"}
                      </span>
                      <span className="font-medium">{fmtMoney(p.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}


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
              {gNum("descontoPercentual") > 0 && (
                <>
                  <div className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-semibold">
                      {fmtMoney(gNum("subtotalSemDesconto"))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-muted-foreground">
                      Desconto aplicado ({gNum("descontoPercentual")}%)
                    </span>
                    <span className="font-semibold text-rose-600">
                      - {fmtMoney(gNum("descontoValor"))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-muted-foreground">Subtotal com desconto</span>
                    <span className="font-semibold">
                      {fmtMoney(gNum("subtotalComDesconto"))}
                    </span>
                  </div>
                </>
              )}
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

            {general.sinalAtivo === "sim" && gNum("valorSinal") > 0 && (
              <div className="rounded-lg border border-border divide-y divide-border">
                <div className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Sinal aplicado</span>
                  <span className="font-semibold">{fmtMoney(gNum("valorSinal"))}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 text-sm bg-muted/30">
                  <span className="font-semibold text-foreground">Valor a receber</span>
                  <span className="font-bold text-emerald-600">
                    {fmtMoney(gNum("valorAReceber"))}
                  </span>
                </div>
              </div>
            )}

            {extraActions}
          </div>
        )}
      </DialogContent>

      <Dialog open={verParcelasOpen} onOpenChange={setVerParcelasOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Parcelas ({parcelasList.length}x)</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto pr-1 mt-2 space-y-1 flex-1">
            {parcelasList.map((p) => (
              <div
                key={p.numero}
                className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0"
              >
                <span className="text-muted-foreground">
                  {p.numero}/{parcelasList.length} ·{" "}
                  {p.vencimento ? fmtDate(p.vencimento) : "—"}
                </span>
                <span className="font-semibold">{fmtMoney(p.valor)}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
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
