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
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Power, AlertCircle } from "lucide-react";
import {
  listOperators,
  createOperator,
  updateOperator,
  deleteOperator,
  listOperationalAccounts,
} from "@/lib/operators.functions";
import { listResellers } from "@/lib/admin-users.functions";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/operadores")({
  head: () => ({ meta: [{ title: "Usuários — Total Maxx ERP" }] }),
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
type Reseller = { id: string; full_name: string | null; username: string | null; role: string };

type FormState = {
  id?: string;
  name: string;
  nickname: string;
  pin: string;
  company_id: string; // apenas para Admin escolher a empresa
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
  company_id: "",
  operational_account_id: "",
  can_edit_budgets: true,
  can_create_products: true,
  can_create_clients: true,
  can_delete_orders: false,
  max_discount_percent: 10,
};

function OperadoresPage() {
  const { role, profile, loading } = useAuth();
  const isOperational = !!profile?.parent_user_id;
  const isAdmin = role === "admin";
  const canManage = (role === "revendedor" || role === "admin") && !isOperational;
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && role && !canManage) navigate({ to: "/", replace: true });
  }, [loading, role, canManage, navigate]);

  const qc = useQueryClient();

  const list = useServerFn(listOperators);
  const listAccts = useServerFn(listOperationalAccounts);
  const listResellersFn = useServerFn(listResellers);
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

  // Lista de empresas (apenas Admin)
  const { data: resellers = [] } = useQuery({
    queryKey: ["admin-resellers"],
    queryFn: () => listResellersFn() as Promise<Reseller[]>,
    enabled: isAdmin,
  });

  // Conta de acesso alvo: para Admin usa a empresa escolhida no form;
  // para Revendedor sempre a própria empresa (backend resolve).
  const accountsCompanyId = isAdmin ? form.company_id : undefined;

  const { data: accounts = [], isFetching: loadingAccounts } = useQuery({
    queryKey: ["operational-accounts", accountsCompanyId ?? "self"],
    queryFn: () =>
      listAccts(
        accountsCompanyId ? ({ data: { company_id: accountsCompanyId } } as never) : (undefined as never),
      ) as Promise<OpAcct[]>,
    enabled: !isOperational && (!isAdmin || !!accountsCompanyId),
  });

  const acctMap = useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach((a) => m.set(a.id, a.full_name));
    return m;
  }, [accounts]);

  // Auto-selecionar a primeira conta quando o diálogo abrir / lista carregar
  useEffect(() => {
    if (!dialogOpen) return;
    if (form.id) return; // não sobrescrever edição
    if (!accounts.length) return;
    if (form.operational_account_id) return;
    setForm((f) => ({ ...f, operational_account_id: accounts[0].id }));
  }, [dialogOpen, accounts, form.id, form.operational_account_id]);

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
      company_id: "",
      operational_account_id: o.operational_account_id ?? "",
      can_edit_budgets: o.can_edit_budgets,
      can_create_products: o.can_create_products,
      can_create_clients: o.can_create_clients,
      can_delete_orders: o.can_delete_orders,
      max_discount_percent: o.max_discount_percent,
    });
    setDialogOpen(true);
  }

  // Precisa haver uma Conta de Acesso para poder criar Usuário
  const hasAccounts = accounts.length > 0;
  const needsCompanyFirst = isAdmin && !form.company_id;
  const canSubmit = !!form.operational_account_id && !!form.name.trim();

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Informe o nome do usuário.");
      return;
    }
    if (!form.id && !form.operational_account_id) {
      toast.error("Selecione uma Conta de Acesso para vincular o usuário.");
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
      const opAcct = form.operational_account_id || null;
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
        toast.success("Usuário atualizado.");
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

  const canPickAccount = !isOperational && (role === "admin" || role === "revendedor");

  if (loading || !role) {
    return (
      <AppShell
        title="Usuários"
        subtitle="Usuários identificam quem está utilizando o sistema no dia a dia. Eles não fazem login."
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

  // Para revendedor, o botão "Novo Usuário" só é habilitado quando existir ao menos uma Conta.
  const createDisabled = !isAdmin && !hasAccounts;

  return (
    <AppShell
      title="Usuários"
      subtitle="Usuários identificam quem está utilizando o sistema no dia a dia. Eles não fazem login."
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
            disabled={createDisabled}
            title={
              createDisabled
                ? "Cadastre primeiro uma Conta de Acesso para esta empresa antes de criar usuários."
                : undefined
            }
            className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Novo Usuário
          </Button>
        </div>

        {!isAdmin && !hasAccounts && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Cadastre primeiro uma Conta de Acesso para esta empresa antes de criar usuários.
            </span>
          </div>
        )}

        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
                <th className="font-medium py-3 px-6">Nome</th>
                {!isOperational && (
                  <th className="font-medium py-3 px-3">Conta de acesso</th>
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
                    </td>

                    {!isOperational && (
                      <td className="py-3.5 px-3 text-muted-foreground">
                        {o.operational_account_id
                          ? acctMap.get(o.operational_account_id) ?? "—"
                          : <span className="italic">—</span>}
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
            <DialogTitle>{form.id ? "Editar usuário" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              Usuários identificam quem está utilizando o sistema no dia a dia. Eles não fazem login.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            {/* Admin: escolher a empresa primeiro */}
            {isAdmin && !form.id && (
              <div className="space-y-1.5">
                <Label>Empresa *</Label>
                <Select
                  value={form.company_id}
                  onValueChange={(v) =>
                    setForm({ ...form, company_id: v, operational_account_id: "" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a empresa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {resellers.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.full_name || r.username || "Empresa"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
                  <Label>Conta de acesso *</Label>
                  <Select
                    value={form.operational_account_id}
                    onValueChange={(v) => setForm({ ...form, operational_account_id: v })}
                    disabled={needsCompanyFirst || loadingAccounts || !hasAccounts}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          needsCompanyFirst
                            ? "Selecione a empresa primeiro..."
                            : loadingAccounts
                              ? "Carregando..."
                              : !hasAccounts
                                ? "Nenhuma conta disponível"
                                : "Selecione..."
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!needsCompanyFirst && !loadingAccounts && !hasAccounts && (
                    <p className="text-xs text-amber-700">
                      Cadastre primeiro uma Conta de Acesso para esta empresa antes de criar usuários.
                    </p>
                  )}
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
                disabled={saving || !canSubmit}
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
