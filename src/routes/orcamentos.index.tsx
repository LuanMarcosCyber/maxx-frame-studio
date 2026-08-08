import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, MoreHorizontal, Eye, Pencil, Trash2, Image as ImageIcon, Check, Printer, Store, Hammer, User, FileText, CalendarDays, CreditCard, Wallet, Package, ClipboardCheck, UserCog, Users, DollarSign, AlertCircle } from "lucide-react";
import { cn, fmtMeasure, fmtDateBR, fmtPct } from "@/lib/utils";

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
import { NovoOrcamentoButton } from "@/components/NovoOrcamentoButton";
import { useAuth } from "@/hooks/useAuth";
import { useOperator } from "@/hooks/useOperator";
import { toast } from "sonner";
import { nextDocumentNumber } from "@/lib/document-number.functions";
import { getAdminDocumentView } from "@/lib/report-view.functions";
import { isDiversosOnly } from "@/lib/frame-detection";
import { useActivityLog } from "@/hooks/useActivityLog";

export const Route = createFileRoute("/orcamentos/")({
  head: () => ({ meta: [{ title: "Orçamentos — Total Maxx ERP" }] }),
  validateSearch: (search: Record<string, unknown>): { view?: string } =>
    typeof search.view === "string" ? { view: search.view } : {},
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
  operator_name?: string | null;
};

function collaboratorLabel(row: BudgetRow, names: Map<string, string>) {
  const vendor = (row.details as { vendedorNome?: string } | null)?.vendedorNome?.trim();
  if (vendor) return vendor;
  if (!row.created_by || row.created_by === row.user_id) return "—";
  return names.get(row.created_by) || "—";
}


function Orcamentos() {
  const { session, ownerUserId, role, profile } = useAuth();
  const showCollaborator = role !== "colaborador";
  // Todo usuário pode editar orçamentos (a permissão dedicada foi removida).
  const canEditBudgets = true;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logAct = useActivityLog();
  const nextDocumentNumberFn = useServerFn(nextDocumentNumber);
  const { requirePin } = useOperator();
  const { view: viewParam } = Route.useSearch();

  const [search, setSearch] = useState("");
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
  const [printingFor, setPrintingFor] = useState<BudgetRow | null>(null);
  const [diversosOnlyConfirm, setDiversosOnlyConfirm] = useState(false);

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
        .select("id, number, client_name, client_id, total_value, status, created_at, data_vencimento, details, user_id, created_by, operator_name")
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    const digitsQ = q.replace(/\D+/g, "");
    return rows.filter((b) => {
      const d = (b.details ?? {}) as any;
      const haystack = [
        b.number,
        b.client_name,
        b.status,
        d?.client?.document,
        d?.client?.phone,
        d?.client?.mobile_phone,
        d?.client?.commercial_phone,
        d?.client?.whatsapp,
        d?.client?.email,
        d?.observacoes,
        d?.obs,
        ...(Array.isArray(d?.items)
          ? d.items.flatMap((it: any) => [
              it?.descricao,
              it?.description,
              ...(Array.isArray(it?.componentes)
                ? it.componentes.map((c: any) => `${c?.codigo ?? ""} ${c?.descricao ?? ""}`)
                : []),
            ])
          : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (haystack.includes(q)) return true;
      if (digitsQ.length >= 3 && haystack.replace(/\D+/g, "").includes(digitsQ)) return true;
      return false;
    });
  }, [rows, search]);

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
    const ok = await requirePin("excluir orçamento");
    if (!ok) return;
    const { error } = await supabase.from("budgets").delete().eq("id", deleting.id);
    if (error) {
      toast.error("Não foi possível excluir o orçamento.");
      return;
    }
    toast.success("Orçamento excluído.");
    logAct({ action: "budget.deleted", entity: "budget", entityId: deleting.id, description: `Excluiu o orçamento ${deleting.number ?? ""} de ${deleting.client_name ?? ""}.` });
    setDeleting(null);
    await queryClient.invalidateQueries({ queryKey: ["budgets"] });
    await queryClient.invalidateQueries({ queryKey: ["budgets", "pending"] });
  }

  async function checkDiversosOnlyThenApprove() {
    if (!approving) return;
    try {
      const { data: itemsRaw } = await supabase
        .from("budget_items")
        .select("data")
        .eq("budget_id", approving.id);
      const items = (itemsRaw ?? []).map((r) => ({
        data: (r as { data: Record<string, unknown> | null }).data ?? {},
      }));
      const fallback =
        items.length === 0
          ? [{ data: (approving.details ?? {}) as Record<string, unknown> }]
          : items;
      if (isDiversosOnly(fallback)) {
        setDiversosOnlyConfirm(true);
        return;
      }
    } catch (e) {
      console.error(e);
    }
    handleApprove();
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
      let orderId: string | null = existingOrder?.id ?? null;
      if (existingOrder?.id) {
        const { error: upoErr } = await supabase
          .from("orders")
          .update(orderPayload)
          .eq("id", existingOrder.id);
        if (upoErr) throw upoErr;
      } else {
        const orderNumber = String(await nextDocumentNumberFn({ data: { kind: "order" } }));
        const { data: inserted, error: insErr } = await supabase
          .from("orders")
          .insert({
            user_id: ownerUserId ?? session.user.id,
            created_by: approving.created_by ?? session.user.id,
            number: orderNumber,
            budget_id: approving.id,
            ...orderPayload,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        orderId = (inserted as { id: string } | null)?.id ?? null;
      }

      if (orderId) {
        const { error: stockErr } = await supabase.rpc("apply_order_stock", {
          _order_id: orderId,
        });
        if (stockErr) {
          await supabase.from("budgets").update({ status: "Pendente" }).eq("id", approving.id);
          if (!existingOrder?.id) {
            await supabase.from("orders").delete().eq("id", orderId);
          }
          const raw = stockErr.message ?? "";
          const match = raw.match(/INSUFFICIENT_STOCK:(.+)$/);
          let msg = "Estoque insuficiente para aprovar o orçamento.";
          if (match) {
            try {
              const deficits = JSON.parse(match[1]) as Array<{
                product_id: string;
                requested: number;
                available: number;
              }>;
              msg =
                "Estoque insuficiente:\n" +
                deficits
                  .map((d) => `${d.product_id}: pedido ${d.requested}, disponível ${d.available}`)
                  .join("\n");
            } catch {
              // keep default message
            }
          }
          throw new Error(msg);
        }
        await queryClient.invalidateQueries({ queryKey: ["products", "diversos-stock"] });
        await queryClient.invalidateQueries({ queryKey: ["products"] });
      }


      toast.success("Orçamento aprovado e movido para Pedidos.");
      logAct({ action: "budget.converted", entity: "budget", entityId: approving?.id, description: `Transformou o orçamento ${approving?.number ?? ""} de ${approving?.client_name ?? ""} em pedido.` });
      setDiversosOnlyConfirm(false);
      setApproving(null);
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      await queryClient.invalidateQueries({ queryKey: ["budgets", "pending"] });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Não foi possível aprovar o orçamento.${msg ? ` (${msg})` : ""}`);

    } finally {
      setApproveLoading(false);
    }
  }

  function tryApprove(b: BudgetRow) {
    // Permite aprovar mesmo sem cliente cadastrado (venda avulsa / Consumidor).
    setApproving(b);
  }


  return (
    <AppShell title="Orçamentos" subtitle="Gerencie todos os orçamentos da sua revenda">
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
          <div className="relative w-full sm:max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por número, cliente, CPF/CNPJ, telefone, produto..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <NovoOrcamentoButton />

        </div>

        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
                {showCollaborator && (
                  <th className="font-medium py-3 px-6">Usuário</th>
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
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={showCollaborator ? 7 : 6} className="py-8 text-center text-muted-foreground">
                    Nenhum orçamento cadastrado.
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
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
                          title="Visualizar"
                          aria-label="Visualizar"
                          onClick={(e) => { e.stopPropagation(); setViewing(b); }}
                          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition cursor-pointer"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {canEditBudgets && (
                          <button
                            type="button"
                            title="Editar"
                            aria-label="Editar"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate({
                                to: "/orcamentos/novo",
                                search: { id: b.id },
                              });
                            }}
                            className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition cursor-pointer"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          title="Imprimir"
                          aria-label="Imprimir"
                          onClick={(e) => { e.stopPropagation(); setPrintingFor(b); }}
                          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition cursor-pointer"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); tryApprove(b); }}
                          title="Aprovar orçamento"
                          aria-label="Aprovar orçamento"
                          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700 transition cursor-pointer"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Excluir orçamento"
                          aria-label="Excluir orçamento"
                          onClick={(e) => { e.stopPropagation(); setDeleting(b); }}
                          className="h-8 w-8 grid place-items-center rounded-md text-destructive hover:bg-destructive/10 transition cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>


                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ResumoDialog
        budget={viewing}
        onClose={() => setViewing(null)}
        extraActions={
          viewing && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const b = viewing;
                  setViewing(null);
                  setDeleting(b);
                }}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Excluir orçamento
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const b = viewing;
                  setViewing(null);
                  setPrintingFor(b);
                }}
              >
                <Printer className="h-4 w-4 mr-2" /> Imprimir
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const b = viewing;
                  setViewing(null);
                  tryApprove(b);
                }}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Check className="h-4 w-4 mr-2" /> Aprovar orçamento
              </Button>
            </div>
          )
        }
      />

      <Dialog open={!!printingFor} onOpenChange={(o) => !o && setPrintingFor(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Imprimir via para:</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 pt-2">
            {[
              { key: "loja", label: "Loja", Icon: Store },
              { key: "producao", label: "Produção", Icon: Hammer },
              { key: "cliente", label: "Cliente", Icon: User },
            ].map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (!printingFor) return;
                  const id = printingFor.id;
                  setPrintingFor(null);
                  window.open(`/orcamentos/${id}/imprimir/${key}`, "_blank");
                }}
                className="group relative flex flex-col items-center justify-center gap-3 rounded-xl border bg-card px-4 py-8 sm:py-10 shadow-sm transition-all hover:border-brand hover:bg-brand/5 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted group-hover:bg-brand/10 group-hover:text-brand transition-colors">
                  <Icon className="h-7 w-7" />
                </div>
                <span className="text-base font-semibold group-hover:text-brand">{label}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

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
                checkDiversosOnlyThenApprove();
              }}
              disabled={approveLoading}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {approveLoading ? "Aprovando..." : "Aprovar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={diversosOnlyConfirm}
        onOpenChange={(o) => !o && !approveLoading && setDiversosOnlyConfirm(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pedido somente com Produtos Diversos</AlertDialogTitle>
            <AlertDialogDescription>
              Toda a estrutura de quadro deste orçamento está vazia.
              <br />
              Foi identificado que este pedido contém apenas Produtos Diversos.
              <br />
              Deseja gerar o pedido somente com esses produtos?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approveLoading}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleApprove();
              }}
              disabled={approveLoading}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {approveLoading ? "Aprovando..." : "Continuar"}
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
  orderId,
  admin,
  statusOverride,
}: {
  budgetId: string | null;
  onClose: () => void;
  extraActions?: ReactNode;
  orderNumber?: string | null;
  /** Somente para consulta do Administrador Global (relatórios). */
  orderId?: string | null;
  admin?: boolean;
  /** Status atual do pedido (fonte de verdade quando aberto a partir de Pedidos). */
  statusOverride?: string | null;
}) {
  const [budget, setBudget] = useState<BudgetRow | null>(null);
  const [adminItems, setAdminItems] = useState<BudgetItemRow[] | null>(null);
  const [adminOrderNumber, setAdminOrderNumber] = useState<string | null>(null);
  const fetchAdminDoc = useServerFn(getAdminDocumentView);

  useEffect(() => {
    if (!budgetId && !(admin && orderId)) {
      setBudget(null);
      setAdminItems(null);
      setAdminOrderNumber(null);
      return;
    }
    let cancelled = false;
    (async () => {
      if (admin) {
        try {
          const res = (await fetchAdminDoc({
            data: { budget_id: budgetId ?? null, order_id: orderId ?? null },
          })) as unknown as {
            budget: BudgetRow | null;
            items: BudgetItemRow[];
            orderNumber: string | null;
          };
          if (cancelled) return;
          setBudget(res.budget ?? null);
          setAdminItems(res.items ?? []);
          setAdminOrderNumber(res.orderNumber ?? null);
        } catch {
          if (!cancelled) {
            setBudget(null);
            setAdminItems(null);
          }
        }
        return;
      }
      const { data } = await supabase
        .from("budgets")
        .select(
          "id, number, client_name, client_id, total_value, status, created_at, data_vencimento, details, user_id, created_by, operator_name",
        )
        .eq("id", budgetId!)
        .maybeSingle();
      if (!cancelled) setBudget((data as BudgetRow | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [budgetId, orderId, admin]);

  return (
    <ResumoDialog
      budget={budget}
      onClose={onClose}
      extraActions={extraActions}
      orderNumber={orderNumber ?? adminOrderNumber ?? null}
      preloadedItems={adminItems}
      statusOverride={statusOverride ?? null}
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
  preloadedItems,
  statusOverride,
}: {
  budget: BudgetRow | null;
  onClose: () => void;
  extraActions?: ReactNode;
  orderNumber?: string | null;
  /** Itens já carregados (consulta do Administrador Global). */
  preloadedItems?: BudgetItemRow[] | null;
  /** Status atual do pedido; sobrepõe o status do orçamento na visualização. */
  statusOverride?: string | null;
}) {
  const displayStatus = statusOverride ?? budget?.status ?? "";

  const [linkedOrderNumber, setLinkedOrderNumber] = useState<string | null>(null);
  const [pendingDiscount, setPendingDiscount] = useState<{
    percent: number;
    potentialTotal: number;
  } | null>(null);
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

  // Pending discount request (not yet applied to the total).
  useEffect(() => {
    if (!budget?.id) {
      setPendingDiscount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("discount_approval_requests")
        .select("requested_percent")
        .eq("budget_id", budget.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        const pct = Number((data as { requested_percent: number }).requested_percent);
        const subtotal =
          typeof general.subtotalSemDesconto === "number"
            ? (general.subtotalSemDesconto as number)
            : Number(budget.total_value);
        const potential = Math.max(0, subtotal * (1 - pct / 100));
        setPendingDiscount({ percent: pct, potentialTotal: potential });
      } else {
        setPendingDiscount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [budget?.id, general.subtotalSemDesconto, budget?.total_value]);

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
    if (!budget) {
      setCreatorName("—");
      return;
    }
    // Origem preferencial: usuário interno (PIN) gravado no documento, depois o
    // vendedor informado no orçamento e, por fim, o perfil que criou/possui o doc.
    const operador = (budget.operator_name ?? "").trim();
    const vendedor = (
      (budget.details as { vendedorNome?: string } | null)?.vendedorNome ?? ""
    ).trim();
    if (operador || vendedor) {
      setCreatorName(operador || vendedor);
      return;
    }
    const profileId = budget.created_by || budget.user_id;
    if (!profileId) {
      setCreatorName("—");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", profileId)
        .maybeSingle();
      if (cancelled) return;
      const row = data as { full_name?: string | null; username?: string | null } | null;
      setCreatorName(row?.full_name || row?.username || "—");
    })();
    return () => {
      cancelled = true;
    };
  }, [budget?.id, budget?.operator_name, budget?.created_by, budget?.user_id, budget?.details]);
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
      let data: BudgetItemRow[] | null = preloadedItems ?? null;
      if (!data) {
        const res = await supabase
          .from("budget_items")
          .select("id, position, subtotal, data")
          .eq("budget_id", budget.id)
          .order("position", { ascending: true });
        data = (res.data ?? []) as BudgetItemRow[];
      }
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
  }, [budget?.id, preloadedItems]);

  const tipoEntrega = gStr("tipoEntrega") || "Retirada";
  const instalacaoAtivo = general.instalacaoAtivo === "sim";
  const entregaAtiva = tipoEntrega !== "Retirada";

  // RT / comissão de arquiteto (e qualquer reajuste percentual sobre os itens)
  // já aplicada nos valores exibidos, para que a soma bata com o total geral.
  const rtPercNum = gNum("rtPercentual");
  const rtMult = 1 + (rtPercNum || 0) / 100;
  const fmtMoneyRt = (n: number) => fmtMoney(n * rtMult);
  const arquitetoNome = gStr("arquitetoNome");
  const arquitetoPerc = gNum("arquitetoPercentual") || rtPercNum;

  const moneyOrNA = (active: boolean, value: number) =>
    !active ? "Não aplicado" : fmtMoneyRt(value);

  const productLabel = (d: Record<string, unknown>, code: string, desc: string) => {
    const c = typeof d[code] === "string" ? (d[code] as string) : "";
    const dd = typeof d[desc] === "string" ? (d[desc] as string) : "";
    if (!c && !dd) return "Não aplicado";
    return `${c}${c && dd ? " — " : ""}${dd}`;
  };
  const dNum = (d: Record<string, unknown>, k: string) =>
    typeof d[k] === "number" ? (d[k] as number) : 0;

  const isPedido = !!orderNumber;
  const diversosOnly = isPedido && isDiversosOnly(items);

  type ItemRow = {
    label: string;
    value: string;
    sub?: string;
    key?: string;
    note?: { title: string; text: string };
  };

  const buildFrameRows = (d: Record<string, unknown>): ItemRow[] => {
    const paspaturAtivo = d.paspaturAtivo === "sim";
    const vidroAtivo = d.vidroTipo === "sim";
    const colagemAtivo = d.colagemAtivo === "sim";
    const impressaoAtivo = d.impressaoAtivo === "sim";
    return [
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
              value: fmtMoneyRt(dNum(d, "valorPaspaturAdicional")),
              sub: productLabel(d, "paspaturAdicionalCode", "paspaturAdicionalDescription"),
              note: (() => {
                const obs =
                  typeof d.paspaturAdicionalObs === "string" ? d.paspaturAdicionalObs.trim() : "";
                return obs ? { title: "Observação do Paspatur Interno", text: obs } : undefined;
              })(),
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
              label: "Perfil externo",
              value: fmtMoneyRt(dNum(d, "valorPerfilPrincipal")),
              sub: productLabel(d, "perfilCode", "perfilDescription"),
            },
            {
              label: "Perfil interno",
              value: fmtMoneyRt(dNum(d, "valorPerfilAdicional")),
              sub: `${productLabel(d, "perfilAdicionalCode", "perfilAdicionalDescription")} · medida ${fmtMeasure(dNum(d, "larguraPerfilAdicional"))} × ${fmtMeasure(dNum(d, "alturaPerfilAdicional"))} cm`,
            },
            {
              label: "Total Perfil",
              value: fmtMoneyRt(dNum(d, "valorPerfil")),
            },
          ]
        : [
            {
              label: "Perfil",
              value: fmtMoneyRt(dNum(d, "valorPerfil")),
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
              return qtd > 1 ? `${base} · ${qtd}× ${fmtMoneyRt(unit)}` : base;
            })()
          : undefined,
      },
      {
        label: "Foam / MDF",
        value: fmtMoneyRt(dNum(d, "valorFoam")),
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
    ];
  };

  const buildDiversosRows = (d: Record<string, unknown>): ItemRow[] =>
    Array.isArray(d.produtosDiversos) && (d.produtosDiversos as unknown[]).length > 0
      ? [
          ...(d.produtosDiversos as Array<Record<string, unknown>>).map((di, i) => {
            const qtd = Number(di.quantidade) || 1;
            const unit = Number(di.valorUnitario) || 0;
            const total = Number(di.total) || unit * qtd;
            const code = typeof di.code === "string" ? di.code : "";
            const nome = typeof di.nome === "string" ? di.nome : "Produto";
            return {
              label: `${code ? `${code} · ` : ""}${nome}`,
              value: fmtMoneyRt(total),
              sub: `Qtd ${qtd} × ${fmtMoneyRt(unit)}`,
              key: `div-${i}`,
            };
          }),
        ]
      : [];

  const rowsForItem = (d: Record<string, unknown>): ItemRow[] =>
    diversosOnly ? buildDiversosRows(d) : [...buildFrameRows(d), ...buildDiversosRows(d)];

  // ---- Resumo financeiro (apenas apresentação; nenhum cálculo alterado) ----
  const subtotalItens = items.reduce((acc, it) => acc + Number(it.subtotal) * rtMult, 0);
  const custosExtras =
    (instalacaoAtivo ? gNum("valorInstalacao") * rtMult : 0) +
    (entregaAtiva ? gNum("valorEntrega") * rtMult : 0) +
    gNum("maoDeObraExtra");
  const descontoValor = gNum("descontoValor");
  const temDesconto = gNum("descontoPercentual") > 0 && descontoValor > 0;
  const temSinal = general.sinalAtivo === "sim" && gNum("valorSinal") > 0;

  return (
    <Dialog open={!!budget} onOpenChange={(o) => !o && onClose()}>
      <DialogContent hideClose className="w-[96vw] sm:max-w-[1180px] max-h-[95vh] overflow-y-auto p-0">
        {budget && (
          <>
            <DialogHeader className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3 sm:px-5">
              <DialogTitle className="flex flex-wrap items-center gap-3 text-left">
                <span className="flex items-center gap-2 text-lg font-semibold">
                  <FileText className="h-5 w-5 text-primary" />
                  Resumo do {isPedido ? "pedido" : "orçamento"}
                </span>
                <span className="font-mono text-sm text-muted-foreground">
                  {orderNumber ?? budget.number}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    statusStyle[displayStatus] ?? "bg-muted text-muted-foreground",
                  )}
                >
                  {displayStatus}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  {extraActions}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Fechar"
                    title="Fechar"
                    className="h-10 w-10 sm:h-9 sm:w-9 grid place-items-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="px-3 pb-4 sm:px-4 space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,340px)] gap-3 items-start">
                {/* ---------- Coluna esquerda: itens ---------- */}
                <div className="order-2 lg:order-1 min-w-0 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 shrink-0 text-primary" />
                    <span className="text-base font-semibold">
                      Itens do {isPedido ? "pedido" : "orçamento"}
                    </span>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      {items.length} {items.length === 1 ? "item" : "itens"}
                    </span>
                  </div>

                  <div
                    className={cn(
                      "min-w-0",
                      items.length >= 3 && "lg:max-h-[calc(95vh-190px)] lg:overflow-y-auto lg:pr-1 lg:overscroll-contain",
                    )}
                  >
                  <div
                    className={cn(
                      "grid gap-3",
                      items.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 items-start",
                    )}
                  >

                    {items.map((it, i) => {
                      const di = (it.data ?? {}) as Record<string, unknown>;
                      const rows = rowsForItem(di);
                      return (
                        <div
                          key={it.id}
                          className="min-w-0 rounded-xl border border-border bg-card overflow-hidden"
                        >
                          <div className="px-3 py-2 border-b border-border bg-muted/40">
                            <div className="flex items-start justify-between gap-2">
                              <span className="min-w-0 truncate font-semibold text-foreground">
                                Item {i + 1}
                                {diversosOnly ? " — Produtos Diversos" : ""}
                              </span>
                              <span className="shrink-0 font-bold text-primary whitespace-nowrap">
                                {fmtMoneyRt(Number(it.subtotal))}
                              </span>
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              Quantidade:{" "}
                              <span className="font-semibold text-foreground">
                                {Number(di.quantidade) || 1}
                              </span>
                            </div>
                          </div>
                          <div className="divide-y divide-border">
                            {rows.map((r, ri) => (
                              <div key={r.key ?? `${r.label}-${ri}`}>
                                <div className="flex items-start justify-between gap-2 px-3 py-1.5 text-sm">
                                  <div className="min-w-0">
                                    <div className="font-medium text-foreground break-words">
                                      {r.label}
                                    </div>
                                    {r.sub && (
                                      <div className="text-xs text-muted-foreground break-words">
                                        {r.sub}
                                      </div>
                                    )}
                                  </div>
                                  <div className="shrink-0 font-semibold text-foreground whitespace-nowrap">
                                    {r.value}
                                  </div>
                                </div>
                                {r.note && (
                                  <div className="mx-3 mb-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5">
                                    <div className="text-xs font-semibold uppercase tracking-wider text-amber-900">
                                      ↓ {r.note.title}
                                    </div>
                                    <div className="mt-0.5 text-sm text-amber-900 whitespace-pre-wrap break-words">
                                      {r.note.text}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </div>


                  {gStr("observacoes") && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-900">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        Observação do {isPedido ? "pedido" : "orçamento"}
                      </div>
                      <div className="mt-1 text-sm text-amber-900 whitespace-pre-wrap break-words">
                        {gStr("observacoes")}
                      </div>
                    </div>
                  )}
                </div>

                {/* ---------- Coluna direita: informações + financeiro ---------- */}
                <div className="order-1 lg:order-2 min-w-0 space-y-3 lg:sticky lg:top-16 self-start">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-x-3 gap-y-2">
                      <InfoLine icon={User} label="Cliente" value={budget.client_name} />
                      {isPedido ? (
                        <InfoLine icon={FileText} label="Origem do orçamento" value={budget.number} mono />
                      ) : linkedOrderNumber ? (
                        <InfoLine icon={FileText} label="Pedido gerado" value={linkedOrderNumber} mono />
                      ) : null}
                      <InfoLine icon={ClipboardCheck} label="Status" value={displayStatus} />
                      <InfoLine
                        icon={CalendarDays}
                        label={isPedido ? "Data do pedido" : "Data do orçamento"}
                        value={fmtDate(budget.created_at)}
                      />
                      <InfoLine
                        icon={CalendarDays}
                        label="Data de entrega"
                        value={gStr("dataEntrega") ? fmtDateBR(gStr("dataEntrega")) : "—"}
                      />
                      {!isParcelado && (
                        <InfoLine
                          icon={CalendarDays}
                          label="Vencimento"
                          value={budget.data_vencimento ? fmtDateBR(budget.data_vencimento) : "—"}
                        />
                      )}
                      <InfoLine icon={UserCog} label="Usuário" value={creatorName} />
                      <InfoLine
                        icon={CreditCard}
                        label="Forma de pagamento"
                        value={gStr("formaPagamento") || "—"}
                      />
                      <InfoLine
                        icon={Wallet}
                        label="Condição de pagamento"
                        value={isParcelado ? `Parcelado · ${parcelasList.length}x` : "À vista"}
                      />
                      {arquitetoNome.trim() && (
                        <InfoLine
                          icon={Users}
                          label="Arquiteto"
                          value={
                            arquitetoPerc > 0
                              ? `${arquitetoNome} (${fmtPct(arquitetoPerc)})`
                              : arquitetoNome
                          }
                        />
                      )}
                    </div>

                    {isParcelado && (
                      <div className="mt-3 border-t border-border pt-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-semibold">
                            Parcelas ({parcelasList.length}x)
                          </span>
                          {parcelasList.length > 6 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setVerParcelasOpen(true)}
                            >
                              Ver todas
                            </Button>
                          )}
                        </div>
                        <div className="rounded-lg border border-border divide-y divide-border">
                          {parcelasList.slice(0, 6).map((p) => (
                            <div
                              key={p.numero}
                              className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm"
                            >
                              <span className="min-w-0 truncate text-muted-foreground">
                                {p.numero}/{parcelasList.length} ·{" "}
                                {p.vencimento ? fmtDateBR(p.vencimento) : "—"}
                              </span>
                              <span className="shrink-0 font-medium">{fmtMoney(p.valor)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ---------- Resumo financeiro ---------- */}
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-brand text-brand-foreground">
                        <DollarSign className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-sm font-semibold">Resumo financeiro</span>
                    </div>

                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Subtotal dos itens</span>
                        <span className="font-semibold whitespace-nowrap">
                          {fmtMoney(subtotalItens)}
                        </span>
                      </div>
                      {custosExtras > 0 && (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Custos extras</span>
                            <span className="font-semibold whitespace-nowrap">
                              {fmtMoney(custosExtras)}
                            </span>
                          </div>
                          <div className="ml-2 space-y-0.5 text-xs text-muted-foreground">
                            {instalacaoAtivo && (
                              <div className="flex items-center justify-between gap-2">
                                <span>Instalação</span>
                                <span className="whitespace-nowrap">
                                  {fmtMoneyRt(gNum("valorInstalacao"))}
                                </span>
                              </div>
                            )}
                            {entregaAtiva && (
                              <div className="flex items-start justify-between gap-2">
                                <span className="min-w-0">
                                  Entrega / Frete ({tipoEntrega})
                                  {tipoEntrega === "Transportadora" &&
                                    gStr("transportadoraNome") && (
                                      <span className="block break-words">
                                        {gStr("transportadoraNome")}
                                      </span>
                                    )}
                                </span>
                                <span className="whitespace-nowrap">
                                  {fmtMoneyRt(gNum("valorEntrega"))}
                                </span>
                              </div>
                            )}
                            {gNum("maoDeObraExtra") > 0 && (
                              <div className="flex items-center justify-between gap-2">
                                <span>MDOE</span>
                                <span className="whitespace-nowrap">
                                  {fmtMoney(gNum("maoDeObraExtra"))}
                                </span>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                      {temDesconto && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">
                            Desconto ({fmtPct(gNum("descontoPercentual"))})
                          </span>
                          <span className="font-semibold text-rose-600 whitespace-nowrap">
                            - {fmtMoney(descontoValor)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-3 rounded-lg bg-gradient-brand px-3 py-2.5 text-brand-foreground shadow-brand">
                      <span className="text-sm font-medium opacity-90">Total geral</span>
                      <span className="text-2xl font-bold leading-tight whitespace-nowrap">
                        {fmtMoney(Number(budget.total_value))}
                      </span>
                    </div>

                    {temSinal && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <FinCell
                          label="Valor recebido / Sinal"
                          value={fmtMoney(gNum("valorSinal"))}
                        />
                        <FinCell
                          label="Valor a receber"
                          value={fmtMoney(gNum("valorAReceber"))}
                          tone="positive"
                        />
                      </div>
                    )}
                  </div>

                  {pendingDiscount && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Possível total se o desconto de {fmtPct(pendingDiscount.percent)} for
                      aprovado:{" "}
                      <span className="font-semibold">
                        {fmtMoney(pendingDiscount.potentialTotal)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </>
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
                  {p.vencimento ? fmtDateBR(p.vencimento) : "—"}
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

function InfoLine({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-1.5 min-w-0">
      <Icon className="h-4 w-4 shrink-0 text-primary/70 mt-0.5" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("text-sm font-medium text-foreground break-words", mono && "font-mono")}>
          {value}
        </div>
      </div>
    </div>
  );
}

function FinCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-lg font-semibold",
          tone === "positive" && "text-emerald-600",
          tone === "negative" && "text-rose-600",
        )}
      >
        {value}
      </div>
    </div>
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
