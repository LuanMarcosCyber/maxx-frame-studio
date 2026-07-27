import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import { Plus, Search, Pencil, Trash2, Power, KeyRound } from "lucide-react";
import {
  listOperators,
  createOperator,
  updateOperator,
  deleteOperator,
} from "@/lib/operators.functions";
import { useAuth } from "@/hooks/useAuth";
import { useOperator } from "@/hooks/useOperator";
import { toast } from "sonner";

const OWNER_LABEL = "proprietário";
const isOwnerRow = (nick: string | null | undefined) => {
  const n = (nick ?? "").trim().toLowerCase();
  return n === "proprietário" || n === "proprietario";
};

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — Total Maxx ERP" },
      {
        name: "description",
        content:
          "Gerencie os usuários internos da empresa: nome, PIN, permissões e status.",
      },
    ],
  }),
  component: UsuariosPage,
});

type Op = {
  id: string;
  name: string;
  nickname: string | null;
  active: boolean;
  has_pin: boolean;
  can_edit_budgets: boolean;
  can_create_products: boolean;
  can_create_clients: boolean;
  can_delete_orders: boolean;
  max_discount_percent: number;
  created_at: string;
};

type FormState = {
  id?: string;
  name: string;
  nickname: string;
  pin: string;
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
  can_edit_budgets: true,
  can_create_products: true,
  can_create_clients: true,
  can_delete_orders: false,
  max_discount_percent: 10,
};

function UsuariosPage() {
  const { role, loading } = useAuth();
  const { activeOperator, requirePin } = useOperator();
  const canManage = role === "revendedor" || role === "admin";
  const isOwner =
    role === "admin" || isOwnerRow(activeOperator?.username ?? null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && role && !canManage) navigate({ to: "/", replace: true });
  }, [loading, role, canManage, navigate]);

  const qc = useQueryClient();

  const list = useServerFn(listOperators);
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
      toast.success("Usuário excluído.");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["operators"] });
      qc.invalidateQueries({ queryKey: ["active-operators"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function guardOwnerAction(action: string): Promise<boolean> {
    if (!isOwner) {
      toast.error("Apenas o proprietário da empresa pode gerenciar usuários.");
      return false;
    }
    const ok = await requirePin(action);
    if (!ok) return false;
    return true;
  }

  async function openCreate() {
    if (!(await guardOwnerAction("criar usuário"))) return;
    setForm(emptyForm);
    setDialogOpen(true);
  }

  async function openEdit(o: Op) {
    if (!(await guardOwnerAction("editar usuário"))) return;
    setForm({
      id: o.id,
      name: o.name,
      nickname: o.nickname ?? "",
      pin: "",
      can_edit_budgets: o.can_edit_budgets,
      can_create_products: o.can_create_products,
      can_create_clients: o.can_create_clients,
      can_delete_orders: o.can_delete_orders,
      max_discount_percent: o.max_discount_percent,
    });
    setDialogOpen(true);
  }

  async function requestToggle(o: Op) {
    if (!(await guardOwnerAction(o.active ? "desativar usuário" : "ativar usuário"))) return;
    if (o.active && isOwnerRow(o.nickname)) {
      const activeOwners = rows.filter((r) => r.active && isOwnerRow(r.nickname)).length;
      if (activeOwners <= 1) {
        toast.error("Defina outro proprietário ativo antes de desativar este.");
        return;
      }
    }
    toggleMut.mutate({ id: o.id, active: !o.active });
  }

  async function requestDelete(o: Op) {
    if (!(await guardOwnerAction("excluir usuário"))) return;
    if (isOwnerRow(o.nickname)) {
      const otherOwners = rows.filter((r) => r.id !== o.id && r.active && isOwnerRow(r.nickname)).length;
      if (otherOwners === 0) {
        toast.error("Defina outro proprietário ativo antes de excluir este.");
        return;
      }
    }
    setDeleting(o);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Informe o nome do usuário.");
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
            ...perms,
          },
        });
        toast.success("Usuário atualizado.");
      } else {
        await create({
          data: {
            name: form.name.trim(),
            nickname: form.nickname.trim() || undefined,
            pin: form.pin,
            operational_account_id: null,
            ...perms,
          },
        });
        toast.success("Usuário criado.");
      }
      qc.invalidateQueries({ queryKey: ["operators"] });
      qc.invalidateQueries({ queryKey: ["active-operators"] });
      setDialogOpen(false);
      setForm(emptyForm);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar usuário.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !role) {
    return (
      <AppShell
        title="Usuários"
        subtitle="Gerencie quem usa o sistema nesta empresa. Cada usuário tem um PIN próprio."
      >
        <div className="text-sm text-muted-foreground">Carregando...</div>
      </AppShell>
    );
  }
  if (!canManage) {
    return (
      <AppShell title="Acesso negado">
        <div className="max-w-md mx-auto mt-10 rounded-lg border border-border bg-card p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Acesso negado</h2>
          <p className="text-sm text-muted-foreground">
            Você não tem permissão para acessar este módulo. Redirecionando…
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Usuários"
      subtitle="Gerencie quem usa o sistema nesta empresa. Cada usuário tem um PIN próprio."
    >
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
          <div className="relative w-full sm:max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar usuário..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            onClick={openCreate}
            disabled={!isOwner}
            title={isOwner ? "Novo usuário" : "Apenas o proprietário da empresa pode gerenciar usuários."}
            className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Novo Usuário
          </Button>
        </div>

        {!isOwner && (
          <div className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Apenas o proprietário da empresa pode gerenciar usuários. Você pode visualizar a lista, mas as ações estão bloqueadas.
          </div>
        )}
        <div aria-hidden className="hidden">{OWNER_LABEL}</div>

        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
                <th className="font-medium py-3 px-6">Nome</th>
                <th className="font-medium py-3 px-3">Permissões</th>
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
                    Nenhum usuário cadastrado.
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
                      {o.nickname && (
                        <div className="text-xs text-muted-foreground font-normal">
                          {o.nickname}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {o.can_edit_budgets && (
                          <Badge variant="outline" className="text-[10px]">
                            Orçamentos
                          </Badge>
                        )}
                        {o.can_create_products && (
                          <Badge variant="outline" className="text-[10px]">
                            Produtos
                          </Badge>
                        )}
                        {o.can_create_clients && (
                          <Badge variant="outline" className="text-[10px]">
                            Clientes
                          </Badge>
                        )}
                        {o.can_delete_orders && (
                          <Badge variant="outline" className="text-[10px]">
                            Exclui pedidos
                          </Badge>
                        )}
                        {o.max_discount_percent > 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            Desc. {o.max_discount_percent}%
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      <Switch
                        checked={o.active}
                        onCheckedChange={() => requestToggle(o)}
                        disabled={toggleMut.isPending || !isOwner}
                        title={isOwner ? undefined : "Apenas o proprietário da empresa pode gerenciar usuários."}
                      />
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(o)}
                          disabled={!isOwner}
                          aria-label="Editar"
                          title={isOwner ? "Editar" : "Apenas o proprietário da empresa pode gerenciar usuários."}
                          className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await openEdit(o);
                            setTimeout(() => {
                              const el = document.getElementById("op-pin");
                              el?.focus();
                            }, 100);
                          }}
                          disabled={!isOwner}
                          aria-label="Redefinir PIN"
                          title={isOwner ? "Redefinir PIN" : "Apenas o proprietário da empresa pode gerenciar usuários."}
                          className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <KeyRound className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          type="button"
                          onClick={() => requestToggle(o)}
                          disabled={!isOwner}
                          aria-label={o.active ? "Desativar" : "Ativar"}
                          title={isOwner ? (o.active ? "Desativar" : "Ativar") : "Apenas o proprietário da empresa pode gerenciar usuários."}
                          className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <Power className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDelete(o)}
                          disabled={!isOwner}
                          aria-label="Excluir"
                          title={isOwner ? "Excluir" : "Apenas o proprietário da empresa pode gerenciar usuários."}
                          className="h-8 w-8 grid place-items-center rounded-md hover:bg-destructive/10 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar usuário" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              Este usuário será identificado no sistema pelo nome e PIN próprios.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="op-name">Nome *</Label>
              <Input
                id="op-name"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value.toUpperCase() })
                }
                placeholder="MÁRCIA"
                required
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="op-nick">Função</Label>
                <Input
                  id="op-nick"
                  value={form.nickname}
                  onChange={(e) =>
                    setForm({ ...form, nickname: e.target.value })
                  }
                  placeholder="Vendedora, Instalador, etc."
                  maxLength={60}
                />
              </div>
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
                    setForm({
                      ...form,
                      pin: e.target.value.replace(/\D/g, "").slice(0, 6),
                    })
                  }
                  pattern="\d{4,6}"
                  maxLength={6}
                  placeholder="4 a 6 dígitos"
                  required={!form.id}
                />
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="text-sm font-medium">Permissões</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span className="text-sm">Editar orçamentos</span>
                  <Switch
                    checked={form.can_edit_budgets}
                    onCheckedChange={(v) =>
                      setForm({ ...form, can_edit_budgets: v })
                    }
                  />
                </label>
                <label className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span className="text-sm">Criar produtos</span>
                  <Switch
                    checked={form.can_create_products}
                    onCheckedChange={(v) =>
                      setForm({ ...form, can_create_products: v })
                    }
                  />
                </label>
                <label className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span className="text-sm">Criar clientes</span>
                  <Switch
                    checked={form.can_create_clients}
                    onCheckedChange={(v) =>
                      setForm({ ...form, can_create_clients: v })
                    }
                  />
                </label>
                <label className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span className="text-sm">Excluir pedidos</span>
                  <Switch
                    checked={form.can_delete_orders}
                    onCheckedChange={(v) =>
                      setForm({ ...form, can_delete_orders: v })
                    }
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
                      setForm({
                        ...form,
                        max_discount_percent: Number(e.target.value),
                      })
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
                {saving ? "Salvando..." : form.id ? "Salvar" : "Criar usuário"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
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
