import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, KeyRound, ShieldCheck, User as UserIcon, MoreHorizontal, Trash2, Eye } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { listResellers, createUser, resetPassword, deleteUser } from "@/lib/admin-users.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/revendedores/")({
  head: () => ({
    meta: [
      { title: "Revendedores — Total Maxx ERP" },
      { name: "description", content: "Área administrativa do Total Maxx ERP para gerenciar revendedores: criar contas, redefinir senhas e visualizar dados por loja." },
      { property: "og:title", content: "Revendedores — Total Maxx ERP" },
      { property: "og:description", content: "Gestão de revendedores no Total Maxx ERP." },
      { property: "og:url", content: "https://maxx-frame-studio.lovable.app/revendedores" },
    ],
    links: [{ rel: "canonical", href: "https://maxx-frame-studio.lovable.app/revendedores" }],
  }),
  component: RevendedoresPage,
});

function RevendedoresPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && role && role !== "admin") {
      navigate({ to: "/", replace: true });
    }
  }, [role, loading, navigate]);

  if (loading || !role) {
    return (
      <AppShell title="Revendedores" subtitle="Gerenciamento de usuários">
        <div className="text-sm text-muted-foreground">Carregando...</div>
      </AppShell>
    );
  }
  if (role !== "admin") return null;

  return (
    <AppShell title="Revendedores" subtitle="Gerenciar usuários do sistema">
      <Content />
    </AppShell>
  );
}

function Content() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const list = useServerFn(listResellers);
  const create = useServerFn(createUser);
  const reset = useServerFn(resetPassword);
  const del = useServerFn(deleteUser);

  const [resetTarget, setResetTarget] = useState<{ id: string; username: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => list(),
  });

  const createMut = useMutation({
    mutationFn: (data: {
      full_name: string;
      username: string;
      password: string;
      role: "admin" | "revendedor";
    }) => create({ data }),
    onSuccess: () => {
      toast.success("Usuário criado com sucesso.");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: (data: { user_id: string; password: string }) => reset({ data }),
    onSuccess: () => {
      toast.success("Senha redefinida com sucesso.");
      setResetTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (user_id: string) => del({ data: { user_id } }),
    onSuccess: () => {
      toast.success("Usuário excluído com sucesso.");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDeleteClick = (u: { id: string; full_name: string | null; username: string | null }) => {
    if (u.id === user?.id) {
      toast.error("Você não pode excluir sua própria conta.");
      return;
    }
    setDeleteTarget({ id: u.id, name: u.full_name || u.username || "este usuário" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Usuários cadastrados</h2>
          <p className="text-sm text-muted-foreground">
            Crie revendedores e administradores. O acesso é feito apenas por usuário e senha.
          </p>
        </div>
        <CreateUserDialog onSubmit={(d) => createMut.mutateAsync(d)} submitting={createMut.isPending} />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum usuário cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{u.username || "—"}</TableCell>
                  <TableCell>
                    {u.role === "admin" ? (
                      <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                        <ShieldCheck className="h-3 w-3 mr-1" /> Admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <UserIcon className="h-3 w-3 mr-1" /> Revendedor
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString("pt-BR")}
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
                        <DropdownMenuItem asChild>
                          <Link to="/revendedores/$id" params={{ id: u.id }}>
                            <Eye className="h-4 w-4 mr-2" /> Ver informações
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setResetTarget({ id: u.id, username: u.username || "" })}
                        >
                          <KeyRound className="h-4 w-4 mr-2" /> Redefinir senha
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(u)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir usuário
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

      <ResetPasswordDialog
        target={resetTarget}
        onOpenChange={(o: boolean) => !o && setResetTarget(null)}
        onSubmit={(pw) =>
          resetTarget ? resetMut.mutateAsync({ user_id: resetTarget.id, password: pw }) : undefined
        }
        submitting={resetMut.isPending}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <span className="font-semibold">{deleteTarget?.name}</span>? Esta ação não pode ser desfeita.
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

function CreateUserDialog({
  onSubmit,
  submitting,
}: {
  onSubmit: (d: {
    full_name: string;
    username: string;
    password: string;
    role: "admin" | "revendedor";
  }) => Promise<unknown>;
  submitting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "revendedor">("revendedor");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await onSubmit({ full_name: fullName, username, password, role });
      setOpen(false);
      setFullName("");
      setUsername("");
      setPassword("");
      setRole("revendedor");
    } catch {
      // toast handled in mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand">
          <UserPlus className="h-4 w-4 mr-2" /> Novo usuário
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            Cadastre um revendedor ou administrador. O acesso é apenas por usuário e senha.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Nome do revendedor</Label>
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
          <div className="space-y-1.5">
            <Label>Tipo de acesso</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "admin" | "revendedor")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="revendedor">Revendedor</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-gradient-brand text-brand-foreground hover:opacity-95"
            >
              {submitting ? "Criando..." : "Criar usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
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

