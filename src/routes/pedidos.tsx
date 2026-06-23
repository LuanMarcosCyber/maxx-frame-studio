import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Search,
  Plus,
  MoreHorizontal,
  Eye,
  Printer,
  RefreshCw,
  Trash2,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BudgetSummaryById } from "./orcamentos.index";

export const Route = createFileRoute("/pedidos")({
  head: () => ({ meta: [{ title: "Pedidos — Total Maxx ERP" }] }),
  component: Pedidos,
});

type OrderRow = {
  id: string;
  number: string;
  client_name: string;
  total_value: number;
  status: string;
  created_at: string;
  budget_id: string | null;
  user_id: string;
  created_by: string | null;
};

const ORDER_STATUSES = [
  "Aprovado",
  "Aguardando pagamento",
  "Em produção",
  "Finalizado",
  "Entregue",
  "Cancelado",
] as const;

const statusStyle: Record<string, string> = {
  "Aprovado": "bg-emerald-100 text-emerald-700",
  "Aguardando pagamento": "bg-amber-100 text-amber-700",
  "Em produção": "bg-blue-100 text-blue-700",
  "Finalizado": "bg-violet-100 text-violet-700",
  "Entregue": "bg-[hsl(var(--brand-end))]/15 text-[hsl(var(--brand-end))]",
  "Cancelado": "bg-red-100 text-red-700",
  "Aguardando": "bg-amber-100 text-amber-700",
};

const fmtMoney = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");

function collaboratorLabel(row: { user_id: string; created_by: string | null }, names: Map<string, string>) {
  if (!row.created_by || row.created_by === row.user_id) return "—";
  return names.get(row.created_by) || "—";
}

function Pedidos() {
  const { session, role } = useAuth();
  const showCollaborator = role !== "colaborador";
  const queryClient = useQueryClient();
  const [viewing, setViewing] = useState<OrderRow | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["orders"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, number, client_name, total_value, status, created_at, budget_id, user_id, created_by")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });

  const budgetIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.budget_id).filter((id): id is string => !!id))),
    [rows],
  );
  const { data: budgetNumbers } = useQuery({
    queryKey: ["budgets", "numbers", budgetIds],
    enabled: budgetIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("budgets")
        .select("id, number")
        .in("id", budgetIds);
      const map = new Map<string, string>();
      (data ?? []).forEach((b: any) => map.set(b.id, b.number));
      return map;
    },
  });
  const budgetNumberMap = budgetNumbers ?? new Map<string, string>();

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
    return rows.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.number.toLowerCase().includes(q) ||
        (o.client_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  async function changeStatus(newStatus: string) {
    if (!viewing) return;
    setSavingStatus(true);
    const { error } = await supabase
      .from("orders")
      .update({ status: newStatus })
      .eq("id", viewing.id);
    setSavingStatus(false);
    if (error) {
      toast.error("Não foi possível atualizar o status.");
      return;
    }
    toast.success(`Status atualizado para "${newStatus}".`);
    setViewing({ ...viewing, status: newStatus });
    setStatusOpen(false);
    await queryClient.invalidateQueries({ queryKey: ["orders"] });
  }

  async function handleDelete() {
    if (!viewing) return;
    const { error } = await supabase.from("orders").delete().eq("id", viewing.id);
    if (error) {
      toast.error("Não foi possível excluir o pedido.");
      return;
    }
    toast.success("Pedido excluído.");
    setDeleteOpen(false);
    setViewing(null);
    await queryClient.invalidateQueries({ queryKey: ["orders"] });
  }

  const actions = viewing ? (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
      <Button
        type="button"
        variant="outline"
        onClick={() => setPrintOpen(true)}
        className="h-auto py-3 flex flex-col items-center gap-1"
      >
        <Printer className="h-5 w-5" />
        <span className="text-sm font-medium">Imprimir</span>
        <span className="text-[10px] uppercase tracking-wider text-amber-700">Em breve</span>
      </Button>
      <Button
        type="button"
        onClick={() => setStatusOpen(true)}
        className="h-auto py-3 flex flex-col items-center gap-1 bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
      >
        <RefreshCw className="h-5 w-5" />
        <span className="text-sm font-medium">Mudar estado</span>
        <span className="text-[10px] opacity-80">Status atual: {viewing.status}</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => setDeleteOpen(true)}
        className="h-auto py-3 flex flex-col items-center gap-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-5 w-5" />
        <span className="text-sm font-medium">Excluir pedido</span>
      </Button>
    </div>
  ) : null;

  return (
    <AppShell title="Pedidos" subtitle="Acompanhe o status dos seus pedidos">
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto sm:flex-1">
            <div className="relative w-full sm:max-w-sm">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar pedido ou cliente..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand">
            <Plus className="h-4 w-4 mr-1.5" /> Novo Pedido
          </Button>
        </div>

        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
                <th className="font-medium py-3 px-6">Colaborador</th>
                <th className="font-medium py-3 px-3">Pedido</th>
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
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    Nenhum pedido cadastrado.
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/40 transition">
                    <td className="py-3.5 px-6 text-muted-foreground">
                      {collaboratorLabel(o, namesMap)}
                    </td>
                    <td className="py-3.5 px-3 font-mono font-semibold">
                      <button
                        type="button"
                        onClick={() => setViewing(o)}
                        className="text-primary hover:underline"
                      >
                        {o.number}
                      </button>
                    </td>
                    <td className="py-3.5 px-3">
                      <button
                        type="button"
                        onClick={() => setViewing(o)}
                        className="text-foreground hover:text-primary hover:underline text-left"
                      >
                        {o.client_name}
                      </button>
                    </td>
                    <td className="py-3.5 px-3 text-muted-foreground">
                      {fmtDate(o.created_at)}
                    </td>
                    <td className="py-3.5 px-3 font-semibold">
                      {fmtMoney(Number(o.total_value))}
                    </td>
                    <td className="py-3.5 px-3">
                      <span
                        className={cn(
                          "text-[11px] px-2 py-0.5 rounded-full font-medium",
                          statusStyle[o.status] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Ações"
                            className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent transition"
                          >
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewing(o)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver resumo
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setViewing(o);
                              setStatusOpen(true);
                            }}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Mudar estado
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setViewing(o);
                              setDeleteOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir pedido
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
      </Card>

      <BudgetSummaryById
        budgetId={viewing?.budget_id ?? null}
        onClose={() => {
          if (!statusOpen && !deleteOpen && !printOpen) setViewing(null);
        }}
        extraActions={actions}
      />

      {/* Fallback: pedido sem orçamento vinculado — abrir modal simples só com ações */}
      <Dialog
        open={!!viewing && !viewing.budget_id}
        onOpenChange={(o) => {
          if (!o && !statusOpen && !deleteOpen && !printOpen) setViewing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pedido {viewing?.number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="text-muted-foreground">
              Este pedido não possui orçamento vinculado.
            </div>
            <div className="flex items-center justify-between rounded-lg bg-gradient-brand text-brand-foreground px-5 py-4 shadow-brand">
              <span className="text-sm font-medium">Total geral</span>
              <span className="text-xl font-bold">
                {fmtMoney(Number(viewing?.total_value ?? 0))}
              </span>
            </div>
            {actions}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: mudar status do pedido */}
      <Dialog open={statusOpen} onOpenChange={(o) => !savingStatus && setStatusOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mudar estado do pedido</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ORDER_STATUSES.map((s) => {
              const active = viewing?.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={savingStatus}
                  onClick={() => changeStatus(s)}
                  className={cn(
                    "flex items-center justify-between rounded-md border px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent",
                    savingStatus && "opacity-60",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        (statusStyle[s] ?? "bg-muted").split(" ")[0],
                      )}
                    />
                    {s}
                  </span>
                  {active && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: imprimir em breve */}
      <AlertDialog open={printOpen} onOpenChange={setPrintOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Impressão em breve</AlertDialogTitle>
            <AlertDialogDescription>
              Em breve será possível imprimir versões para cliente, loja e produção.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setPrintOpen(false)}>
              Entendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação: excluir pedido */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação removerá o pedido da lista de pedidos, mas não excluirá o orçamento de origem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir pedido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
