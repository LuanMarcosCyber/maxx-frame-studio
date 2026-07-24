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
import { listResellers, resetPassword, deleteUser, listAllCompanies } from "@/lib/admin-users.functions";
import { createCompanyWithOwner } from "@/lib/companies.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/revendedores/")({
  head: () => ({
    meta: [
      { title: "Empresas — Total Maxx ERP" },
      { name: "description", content: "Área administrativa do Total Maxx ERP para gerenciar empresas: criar contas, redefinir senhas e visualizar dados por loja." },
      { property: "og:title", content: "Empresas — Total Maxx ERP" },
      { property: "og:description", content: "Gestão de empresas no Total Maxx ERP." },
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
      <AppShell title="Empresas" subtitle="Gerenciamento de usuários">
        <div className="text-sm text-muted-foreground">Carregando...</div>
      </AppShell>
    );
  }
  if (role !== "admin") return null;

  return (
    <AppShell title="Empresas" subtitle="Gerenciar usuários do sistema">

      <Content />
    </AppShell>
  );
}

function Content() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const list = useServerFn(listResellers);
  const create = useServerFn(createCompanyWithOwner);
  const reset = useServerFn(resetPassword);
  const del = useServerFn(deleteUser);

  const [resetTarget, setResetTarget] = useState<{ id: string; username: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => list(),
  });

  const createMut = useMutation({
    mutationFn: (data: Parameters<typeof createCompanyWithOwner>[0] extends { data: infer D } ? D : never) => create({ data } as never),
    onSuccess: () => {
      toast.success("Empresa criada com sucesso.");
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Empresas cadastradas</h2>
          <p className="text-sm text-muted-foreground">
            Crie uma nova empresa com seu login principal e o usuário interno proprietário.
          </p>

        </div>
        <NewCompanyWizard onSubmit={(d) => createMut.mutateAsync(d)} submitting={createMut.isPending} />
      </div>

      <div className="rounded-lg border bg-card -mx-4 sm:mx-0 overflow-x-auto">
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
                        <UserIcon className="h-3 w-3 mr-1" /> Empresa
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

type WizardPayload = {
  owner_name: string;
  store_name: string;
  username: string;
  password: string;
  pin: string;
  company_group_id: string | null;
  commercial: {
    document?: string | null;
    document_type?: "CPF" | "CNPJ" | null;
    email?: string | null;
    phone?: string | null;
    cep?: string | null;
    address?: string | null;
    address_number?: string | null;
    city?: string | null;
    state?: string | null;
  };
};

function NewCompanyWizard({
  onSubmit,
  submitting,
}: {
  onSubmit: (d: WizardPayload) => Promise<unknown>;
  submitting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1
  const [ownerName, setOwnerName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [companyGroupId, setCompanyGroupId] = useState<string | null>(null);
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);

  // Step 2 (commercial)
  const [document, setDocument] = useState("");
  const [documentType, setDocumentType] = useState<"CPF" | "CNPJ">("CNPJ");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cep, setCep] = useState("");
  const [address, setAddress] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  const listCompanies = useServerFn(listAllCompanies);
  const { data: companies = [] } = useQuery({
    queryKey: ["admin", "companies-for-group"],
    queryFn: () => listCompanies(),
    enabled: open,
  });

  const selectedCompany = companies.find((c) => c.id === companyGroupId);
  const filteredCompanies = companyQuery.trim()
    ? companies.filter((c) =>
        (c.store_name || c.full_name || "").toLowerCase().includes(companyQuery.trim().toLowerCase()),
      )
    : companies;

  const reset = () => {
    setStep(1);
    setOwnerName("");
    setStoreName("");
    setUsername("");
    setPassword("");
    setPasswordConfirm("");
    setPin("");
    setPinConfirm("");
    setCompanyGroupId(null);
    setCompanyQuery("");
    setDocument("");
    setDocumentType("CNPJ");
    setEmail("");
    setPhone("");
    setCep("");
    setAddress("");
    setAddressNumber("");
    setCity("");
    setState("");
  };

  const validateStep1 = (): string | null => {
    if (!ownerName.trim()) return "Informe o nome do proprietário.";
    if (!storeName.trim()) return "Informe o nome da loja.";
    if (!/^[a-z0-9._-]{3,}$/.test(username.trim()))
      return "Usuário inválido. Use minúsculas, números, ponto, hífen ou underscore.";
    if (password.length < 6) return "Senha deve ter pelo menos 6 caracteres.";
    if (password !== passwordConfirm) return "As senhas não coincidem.";
    if (!/^\d{4,6}$/.test(pin)) return "PIN deve conter de 4 a 6 dígitos.";
    if (pin !== pinConfirm) return "Os PINs não coincidem.";
    return null;
  };

  const goNext = () => {
    const err = validateStep1();
    if (err) {
      toast.error(err);
      return;
    }
    setStep(2);
  };

  const finish = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await onSubmit({
        owner_name: ownerName.trim(),
        store_name: storeName.trim(),
        username: username.trim().toLowerCase(),
        password,
        pin,
        company_group_id: companyGroupId,
        commercial: {
          document: document.trim() || null,
          document_type: document.trim() ? documentType : null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          cep: cep.trim() || null,
          address: address.trim() || null,
          address_number: addressNumber.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
        },
      });
      setOpen(false);
      reset();
    } catch {
      // toast handled in mutation
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand">
          <UserPlus className="h-4 w-4 mr-2" /> Nova empresa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova empresa</DialogTitle>
          <DialogDescription>
            Etapa {step} de 2 — {step === 1 ? "Acesso e proprietário" : "Dados comerciais"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="owner_name">Nome do proprietário *</Label>
              <Input
                id="owner_name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="João da Silva"
                autoCapitalize="characters"
                className="uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="store_name">Nome da loja *</Label>
              <Input
                id="store_name"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Molduraria Silva"
                autoCapitalize="characters"
                className="uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Usuário de login *</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                autoCapitalize="none"
                pattern="[a-z0-9._\-]+"
                placeholder="joao.silva"
              />
              <p className="text-[11px] text-muted-foreground">
                Apenas letras minúsculas, números, ponto, hífen ou underscore.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha inicial *</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  placeholder="Mín. 6 caracteres"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password_confirm">Confirmar senha *</Label>
                <Input
                  id="password_confirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  minLength={6}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pin">PIN do proprietário *</Label>
                <Input
                  id="pin"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="4 a 6 dígitos"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pin_confirm">Confirmar PIN *</Label>
                <Input
                  id="pin_confirm"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company_link">Vincular como filial de</Label>
              <div className="relative">
                <Input
                  id="company_link"
                  value={
                    companyOpen
                      ? companyQuery
                      : selectedCompany
                        ? selectedCompany.store_name || selectedCompany.full_name || ""
                        : ""
                  }
                  placeholder="Nenhum vínculo"
                  onFocus={() => {
                    setCompanyOpen(true);
                    setCompanyQuery("");
                  }}
                  onChange={(e) => {
                    setCompanyOpen(true);
                    setCompanyQuery(e.target.value);
                  }}
                  onBlur={() => setTimeout(() => setCompanyOpen(false), 150)}
                  autoComplete="off"
                />
                {companyOpen && (
                  <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCompanyGroupId(null);
                        setCompanyQuery("");
                        setCompanyOpen(false);
                      }}
                    >
                      Nenhum vínculo
                    </button>
                    {filteredCompanies.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Nenhuma empresa encontrada.
                      </div>
                    ) : (
                      filteredCompanies.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setCompanyGroupId(c.id);
                            setCompanyQuery("");
                            setCompanyOpen(false);
                          }}
                        >
                          {c.store_name || c.full_name || "—"}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Opcional. Empresas vinculadas compartilham produtos, clientes, arquitetos e transportadoras.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                onClick={goNext}
                className="bg-gradient-brand text-brand-foreground hover:opacity-95"
              >
                Próximo
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={finish} className="space-y-4">
            <div className="grid grid-cols-[110px,1fr] gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={documentType} onValueChange={(v) => setDocumentType(v as "CPF" | "CNPJ")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CNPJ">CNPJ</SelectItem>
                    <SelectItem value="CPF">CPF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="document">{documentType}</Label>
                <Input id="document" value={document} onChange={(e) => setDocument(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-[140px,1fr,110px] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cep">CEP</Label>
                <Input id="cep" value={cep} onChange={(e) => setCep(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">Logradouro</Label>
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address_number">Número</Label>
                <Input
                  id="address_number"
                  value={addressNumber}
                  onChange={(e) => setAddressNumber(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-[1fr,110px] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="city">Cidade</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">UF</Label>
                <Input
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                  maxLength={2}
                  className="uppercase"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                disabled={submitting}
              >
                Voltar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-gradient-brand text-brand-foreground hover:opacity-95"
              >
                {submitting ? "Criando..." : "Criar empresa"}
              </Button>
            </DialogFooter>
          </form>
        )}
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

