import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMemo, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Power } from "lucide-react";
import {
  listOperators,
  createOperator,
  updateOperator,
  deleteOperator,
  listOperationalAccounts,
} from "@/lib/operators.functions";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/operadores")({
  head: () => ({ meta: [{ title: "Operadores — Total Maxx ERP" }] }),
  component: OperadoresPage,
});

type Op = {
  id: string;
  name: string;
  nickname: string | null;
  active: boolean;
  operational_account_id: string | null;
  has_pin: boolean;
  can_edit_budgets: boolean;
  can_create_products: boolean;
  can_create_clients: boolean;
  can_delete_orders: boolean;
  max_discount_percent: number;
  created_at: string;
};

type OpAcct = { id: string; full_name: string; username: string | null; active: boolean };

type FormState = {
  id?: string;
  name: string;
  nickname: string;
  pin: string;
  operational_account_id: string;
  can_edit_budgets: boolean;
  can_create_products: boolean;
  can_create_clients: boolean;
  can_delete_orders: boolean;
  max_discount_percent: number;
};

const emptyForm: FormState = {
  name: "",
  nickname: "",
  pin: "",
  operational_account_id: "__none__",
  can_edit_budgets: true,
  can_create_products: true,
  can_create_clients: true,
  can_delete_orders: false,
  max_discount_percent: 10,
};

function OperadoresPage() {
  const { role, profile, loading } = useAuth();
  const isOperational = !!profile?.parent_user_id;
  const canManage = role === "revendedor" || role === "admin";
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && role && !canManage) navigate({ to: "/", replace: true });
  }, [loading, role, canManage, navigate]);
  const qc = useQueryClient();

  const list = useServerFn(listOperators);
  const listAccts = useServerFn(listOperationalAccounts);
  const create = useServerFn(createOperator);
  const update = useServerFn(updateOperator);
  const del = useServerFn(deleteOperator);

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleting, setDeleting] = useState<Op | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["operators"],
    queryFn: () => list() as Promise<Op[]>,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["operational-accounts"],
    queryFn: () => listAccts() as Promise<OpAcct[]>,
    enabled: !isOperational,
  });

  const acctMap = useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach((a) => m.set(a.id, a.full_name));
    return m;
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.nickname ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => update({ data: v }),
    onSuccess: () => {
      toast.success("Status atualizado.");
      qc.invalidateQueries({ queryKey: ["operators"] });
      qc.invalidateQueries({ queryKey: ["active-operators"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Operador excluído.");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["operators"] });
      qc.invalidateQueries({ queryKey: ["active-operators"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(o: Op) {
    setForm({
      id: o.id,
      name: o.name,
      nickname: o.nickname ?? "",
      pin: "",
      operational_account_id: o.operational_account_id ?? "__none__",
      can_edit_budgets: o.can_edit_budgets,
      can_create_products: o.can_create_products,
      can_create_clients: o.can_create_clients,
      can_delete_orders: o.can_delete_orders,
      max_discount_percent: o.max_discount_percent,
    });
    setDialogOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Informe o nome do operador.");
      return;
    }
    if (!form.id && !/^\d{4,6}$/.test(form.pin)) {
      toast.error("Informe um PIN de 4 a 6 dígitos.");
      return;
    }
    if (form.id && form.pin && !/^\d{4,6}$/.test(form.pin)) {
      toast.error("PIN deve ter 4 a 6 dígitos.");
      return;
    }
    setSaving(true);
    try {
      const opAcct =
        form.operational_account_id === "__none__" ? null : form.operational_account_id;
      const perms = {
        can_edit_budgets: form.can_edit_budgets,
        can_create_products: form.can_create_products,
        can_create_clients: form.can_create_clients,
        can_delete_orders: form.can_delete_orders,
        max_discount_percent: Number(form.max_discount_percent) || 0,
      };
      if (form.id) {
        await update({
          data: {
            id: form.id,
            name: form.name.trim(),
            nickname: form.nickname.trim() || null,
            ...(form.pin ? { pin: form.pin } : {}),
            ...(isOperational ? {} : { operational_account_id: opAcct }),
            ...perms,
          },
        });
        toast.success("Operador atualizado.");
      } else {
        await create({
          data: {
            name: form.name.trim(),
            nickname: form.nickname.trim() || undefined,
            pin: form.pin,
            operational_account_id: opAcct,
            ...perms,
          },
        });
        toast.success("Operador criado.");
      }
      qc.invalidateQueries({ queryKey: ["operators"] });
      qc.invalidateQueries({ queryKey: ["active-operators"] });
      setDialogOpen(false);
      setForm(emptyForm);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar operador.");
    } finally {
      setSaving(false);
    }
  }

  const canPickAccount = !isOperational && (role === "admin" || role === "revendedor");

  return (
    <AppShell
      title="Operadores"
      subtitle="Pessoas que operam o sistema no dia a dia (não fazem login)."
    >
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
          <div className="relative w-full sm:max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar operador..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            onClick={openCreate}
            className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Novo Operador
          </Button>
        </div>

        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
                <th className="font-medium py-3 px-6">Nome</th>
                {!isOperational && (
                  <th className="font-medium py-3 px-3">Conta operacional</th>
                )}
                <th className="font-medium py-3 px-3">Ativo</th>
                <th className="font-medium py-3 px-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    Nenhum operador cadastrado.
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/40 transition">
                    <td className="py-3.5 px-6 font-medium">
                      {o.name}{" "}
                      {!o.has_pin && (
                        <Badge variant="destructive" className="ml-1 text-[10px]">
                          Sem PIN
                        </Badge>
                      )}
                    </td>
                    
                    {!isOperational && (
                      <td className="py-3.5 px-3 text-muted-foreground">
                        {o.operational_account_id
                          ? acctMap.get(o.operational_account_id) ?? "—"
                          : <span className="italic">Loja (sem vínculo)</span>}
                      </td>
                    )}
                    <td className="py-3.5 px-3">
                      <Switch
                        checked={o.active}
                        onCheckedChange={(v) => toggleMut.mutate({ id: o.id, active: v })}
                        disabled={toggleMut.isPending}
                      />
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
                          <DropdownMenuItem onClick={() => openEdit(o)}>
                            <Pencil className="h-4 w-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => toggleMut.mutate({ id: o.id, active: !o.active })}
                          >
                            <Power className="h-4 w-4 mr-2" />
                            {o.active ? "Desativar" : "Ativar"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleting(o)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar operador" : "Novo operador"}</DialogTitle>
            <DialogDescription>
              Operadores identificam quem está usando o sistema. Eles não fazem login.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="op-name">Nome *</Label>
              <Input
                id="op-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })}
                placeholder="MÁRCIA"
                required
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="op-pin">
                  PIN {form.id ? "(deixe em branco p/ manter)" : "*"}
                </Label>
                <Input
                  id="op-pin"
                  type="password"
                  inputMode="numeric"
                  value={form.pin}
                  onChange={(e) =>
                    setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })
                  }
                  pattern="\d{4,6}"
                  maxLength={6}
                  placeholder="4 a 6 dígitos"
                  required={!form.id}
                />
              </div>
              {canPickAccount && (
                <div className="space-y-1.5">
                  <Label>Conta operacional</Label>
                  <Select
                    value={form.operational_account_id}
                    onValueChange={(v) => setForm({ ...form, operational_account_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Loja (sem vínculo)</SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="text-sm font-medium">Permissões</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span className="text-sm">Editar orçamentos</span>
                  <Switch
                    checked={form.can_edit_budgets}
                    onCheckedChange={(v) => setForm({ ...form, can_edit_budgets: v })}
                  />
                </label>
                <label className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span className="text-sm">Criar produtos</span>
                  <Switch
                    checked={form.can_create_products}
                    onCheckedChange={(v) => setForm({ ...form, can_create_products: v })}
                  />
                </label>
                <label className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span className="text-sm">Criar clientes</span>
                  <Switch
                    checked={form.can_create_clients}
                    onCheckedChange={(v) => setForm({ ...form, can_create_clients: v })}
                  />
                </label>
                <label className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span className="text-sm">Excluir pedidos</span>
                  <Switch
                    checked={form.can_delete_orders}
                    onCheckedChange={(v) => setForm({ ...form, can_delete_orders: v })}
                  />
                </label>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="op-disc">Desconto máximo (%)</Label>
                  <Input
                    id="op-disc"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={form.max_discount_percent}
                    onChange={(e) =>
                      setForm({ ...form, max_discount_percent: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
              >
                {saving ? "Salvando..." : form.id ? "Salvar" : "Criar operador"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir operador?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name} será removido. Registros antigos permanecem inalterados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && delMut.mutate(deleting.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
