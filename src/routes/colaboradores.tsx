import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, KeyRound, MoreHorizontal, Trash2, Pencil, Power } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import {
  listColaboradores,
  createColaborador,
  resetColaboradorPassword,
  toggleColaboradorActive,
  updateColaborador,
  deleteColaborador,
} from "@/lib/colaboradores.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/colaboradores")({
  head: () => ({ meta: [{ title: "Colaboradores — Total Maxx" }] }),
  component: ColaboradoresPage,
});

function ColaboradoresPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  const canManage = role === "revendedor" || role === "admin";

  useEffect(() => {
    if (!loading && role && !canManage) {
      navigate({ to: "/", replace: true });
    }
  }, [role, loading, navigate, canManage]);

  if (loading || !role) {
    return (
      <AppShell title="Colaboradores" subtitle="Gerenciamento da equipe">
        <div className="text-sm text-muted-foreground">Carregando...</div>
      </AppShell>
    );
  }
  if (!canManage) return null;

  return (
    <AppShell title="Colaboradores" subtitle="Gerencie os colaboradores da sua loja">
      <Content />
    </AppShell>
  );
}

type Colab = {
  id: string;
  full_name: string | null;
  username: string | null;
  created_at: string;
  active: boolean;
  can_edit_budgets: boolean;
  can_create_products: boolean;
  can_create_clients: boolean;
  can_delete_orders: boolean;
  max_discount_percent: number;
};

type Permissions = {
  can_edit_budgets: boolean;
  can_create_products: boolean;
  can_create_clients: boolean;
  can_delete_orders: boolean;
  max_discount_percent: number;
};

const DEFAULT_PERMS: Permissions = {
  can_edit_budgets: true,
  can_create_products: true,
  can_create_clients: true,
  can_delete_orders: false,
  max_discount_percent: 100,
};

function Content() {
  const qc = useQueryClient();
  const list = useServerFn(listColaboradores);
  const create = useServerFn(createColaborador);
  const reset = useServerFn(resetColaboradorPassword);
  const toggle = useServerFn(toggleColaboradorActive);
  const update = useServerFn(updateColaborador);
  const del = useServerFn(deleteColaborador);

  const [resetTarget, setResetTarget] = useState<{ id: string; username: string } | null>(null);
  const [editTarget, setEditTarget] = useState<Colab | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["colaboradores"],
    queryFn: () => list() as Promise<Colab[]>,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["colaboradores"] });

  const createMut = useMutation({
    mutationFn: (data: { full_name: string; username: string; password: string }) =>
      create({ data }),
    onSuccess: () => {
      toast.success("Colaborador criado.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: (data: { user_id: string; password: string }) => reset({ data }),
    onSuccess: () => {
      toast.success("Senha redefinida.");
      setResetTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (data: { user_id: string; active: boolean }) => toggle({ data }),
    onSuccess: () => {
      toast.success("Status atualizado.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (data: { user_id: string; full_name: string } & Partial<Permissions>) =>
      update({ data }),
    onSuccess: () => {
      toast.success("Colaborador atualizado.");
      setEditTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (user_id: string) => del({ data: { user_id } }),
    onSuccess: () => {
      toast.success("Colaborador excluído.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Colaboradores cadastrados</h2>
          <p className="text-sm text-muted-foreground">
            Os colaboradores usam os produtos da sua loja e criam orçamentos e pedidos em seu nome.
          </p>
        </div>
        <CreateDialog onSubmit={(d) => createMut.mutateAsync(d)} submitting={createMut.isPending} />
      </div>

      <div className="rounded-lg border bg-card -mx-4 sm:mx-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum colaborador cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{u.username || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">Colaborador</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={u.active}
                      onCheckedChange={(v) =>
                        toggleMut.mutate({ user_id: u.id, active: v })
                      }
                      disabled={toggleMut.isPending}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Ações</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditTarget(u)}>
                          <Pencil className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setResetTarget({ id: u.id, username: u.username || "" })}
                        >
                          <KeyRound className="h-4 w-4 mr-2" /> Redefinir senha
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            toggleMut.mutate({ user_id: u.id, active: !u.active })
                          }
                        >
                          <Power className="h-4 w-4 mr-2" />
                          {u.active ? "Desativar" : "Ativar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            setDeleteTarget({ id: u.id, name: u.full_name || u.username || "este colaborador" })
                          }
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ResetDialog
        target={resetTarget}
        onOpenChange={(o) => !o && setResetTarget(null)}
        onSubmit={(pw) =>
          resetTarget ? resetMut.mutateAsync({ user_id: resetTarget.id, password: pw }) : undefined
        }
        submitting={resetMut.isPending}
      />

      <EditDialog
        target={editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSubmit={(name, perms) =>
          editTarget
            ? updateMut.mutateAsync({ user_id: editTarget.id, full_name: name, ...perms })
            : undefined
        }
        submitting={updateMut.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir colaborador</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir{" "}
              <span className="font-semibold">{deleteTarget?.name}</span>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMut.mutate(deleteTarget.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateDialog({
  onSubmit,
  submitting,
}: {
  onSubmit: (d: { full_name: string; username: string; password: string }) => Promise<unknown>;
  submitting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await onSubmit({ full_name: fullName, username, password });
      setOpen(false);
      setFullName("");
      setUsername("");
      setPassword("");
    } catch {
      // toast handled
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand">
          <UserPlus className="h-4 w-4 mr-2" /> Novo colaborador
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo colaborador</DialogTitle>
          <DialogDescription>
            Cadastre um colaborador da sua loja. Ele usará os produtos cadastrados por você.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Nome</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="João da Silva"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Usuário</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              required
              autoCapitalize="none"
              pattern="[a-z0-9._\-]+"
              placeholder="joao.silva"
            />
            <p className="text-[11px] text-muted-foreground">
              Apenas letras minúsculas, números, ponto, hífen ou underscore.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha inicial</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-gradient-brand text-brand-foreground hover:opacity-95"
            >
              {submitting ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetDialog({
  target,
  onOpenChange,
  onSubmit,
  submitting,
}: {
  target: { id: string; username: string } | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (pw: string) => Promise<unknown> | undefined;
  submitting: boolean;
}) {
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!target) setPassword("");
  }, [target]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await onSubmit(password);
      setPassword("");
    } catch {
      // toast handled
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>
            Defina uma nova senha para <span className="font-mono">{target?.username}</span>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new_password">Nova senha</Label>
            <Input
              id="new_password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-gradient-brand text-brand-foreground hover:opacity-95"
            >
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  target,
  onOpenChange,
  onSubmit,
  submitting,
}: {
  target: Colab | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<unknown> | undefined;
  submitting: boolean;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    setName(target?.full_name ?? "");
  }, [target]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await onSubmit(name);
    } catch {
      // toast handled
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar colaborador</DialogTitle>
          <DialogDescription>
            Atualize o nome do colaborador <span className="font-mono">{target?.username}</span>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit_name">Nome</Label>
            <Input
              id="edit_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-gradient-brand text-brand-foreground hover:opacity-95"
            >
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
