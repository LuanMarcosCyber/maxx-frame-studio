import { createFileRoute } from "@tanstack/react-router";
import { useOperator } from "@/hooks/useOperator";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Search, Plus, Eye, Pencil, Trash2, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fmtCPF, fmtCNPJ } from "@/lib/utils";
import { clientDedupeKey } from "@/lib/client-dedupe";
import { toast } from "sonner";
import { ClientImportWizard } from "@/components/clientes/ClientImportWizard";
import { useActivityLog } from "@/hooks/useActivityLog";

export const Route = createFileRoute("/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Total Maxx ERP" }] }),
  component: () => (
    <PermissionGuard permission="clients">
      <Clientes />
    </PermissionGuard>
  ),
});

type CustomerType = "pessoa_fisica" | "pessoa_juridica";

type ClientRow = {
  id: string;
  name: string;
  customer_type: string;
  commercial_phone: string | null;
  mobile_phone: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  document: string | null;
  cep: string | null;
  address: string | null;
  address_number: string | null;
  city: string | null;
  state: string | null;
  state_registration: string | null;
  notes: string | null;
  created_at: string;
};

type FormState = {
  id?: string;
  name: string;
  customer_type: CustomerType;
  commercial_phone: string;
  mobile_phone: string;
  email: string;
  document: string;
  cep: string;
  address: string;
  address_number: string;
  city: string;
  state: string;
  state_registration: string;
  notes: string;
};

const emptyForm: FormState = {
  name: "",
  customer_type: "pessoa_fisica",
  commercial_phone: "",
  mobile_phone: "",
  email: "",
  document: "",
  cep: "",
  address: "",
  address_number: "",
  city: "",
  state: "",
  state_registration: "",
  notes: "",
};

const customerTypeLabel = (t: string) =>
  t === "pessoa_juridica" ? "Pessoa Jurídica" : "Pessoa Física";

const onlyDigits = (s: string) => (s || "").replace(/\D+/g, "");

function Clientes() {
  const { session, ownerUserId, role, profile } = useAuth();
  const { hasPermission } = useOperator();
  const canCreateClients = role === "admin" || hasPermission("clients");
  const queryClient = useQueryClient();
  const logAct = useActivityLog();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ClientRow | null>(null);
  const [viewing, setViewing] = useState<ClientRow | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllText, setDeleteAllText] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);

  const PAGE_SIZE = 100;
  const term = search.trim();

  const { data, isLoading } = useQuery({
    queryKey: ["clients", "list", term, page],
    enabled: !!session,
    queryFn: async () => {
      let q = supabase
        .from("clients")
        .select(
          "id, name, customer_type, commercial_phone, mobile_phone, phone, whatsapp, email, document, cep, address, address_number, city, state, state_registration, notes, created_at",
          { count: "exact" },
        );
      if (term) {
        const esc = term.replace(/[%,()]/g, " ");
        q = q.or(
          [
            `name.ilike.%${esc}%`,
            `document.ilike.%${esc}%`,
            `commercial_phone.ilike.%${esc}%`,
            `mobile_phone.ilike.%${esc}%`,
            `email.ilike.%${esc}%`,
          ].join(","),
        );
      }
      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await q
        .order("name", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as ClientRow[], count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const filtered = rows;

  const pageNumbers = useMemo(() => {
    const out: (number | "…")[] = [];
    const add = (n: number) => !out.includes(n) && out.push(n);
    add(1);
    for (let n = page - 1; n <= page + 1; n++) if (n > 1 && n < totalPages) add(n);
    if (totalPages > 1) add(totalPages);
    const sorted = (out as number[]).sort((a, b) => a - b);
    const res: (number | "…")[] = [];
    sorted.forEach((n, i) => {
      if (i > 0 && n - (sorted[i - 1] as number) > 1) res.push("…");
      res.push(n);
    });
    return res;
  }, [page, totalPages]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["clients"] });
  }


  function openCreate() {
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(c: ClientRow) {
    setForm({
      id: c.id,
      name: c.name ?? "",
      customer_type:
        c.customer_type === "pessoa_juridica" ? "pessoa_juridica" : "pessoa_fisica",
      commercial_phone: c.commercial_phone ?? c.phone ?? "",
      mobile_phone: c.mobile_phone ?? c.whatsapp ?? "",
      email: c.email ?? "",
      document: c.document ?? "",
      cep: c.cep ?? "",
      address: c.address ?? "",
      address_number: c.address_number ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      state_registration: c.state_registration ?? "",
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function lookupCep(rawCep: string) {
    const cep = onlyDigits(rawCep);
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data?.erro) {
        toast.warning("CEP não encontrado.");
        return;
      }
      setForm((f) => ({
        ...f,
        address: data.logradouro || f.address,
        city: data.localidade || f.city,
        state: data.uf || f.state,
      }));
    } catch {
      toast.error("Não foi possível buscar o CEP.");
    } finally {
      setCepLoading(false);
    }
  }

  async function lookupCnpj(rawCnpj: string) {
    const cnpj = onlyDigits(rawCnpj);
    if (cnpj.length !== 14) {
      toast.warning("Informe um CNPJ válido (14 dígitos).");
      return;
    }
    setCnpjLoading(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!res.ok) {
        toast.warning("CNPJ não encontrado.");
        return;
      }
      const data = await res.json();
      const name =
        data.nome_fantasia?.trim() || data.razao_social?.trim() || "";
      setForm((f) => ({
        ...f,
        name: (name || f.name).toUpperCase(),
        document: fmtCNPJ(cnpj),
        cep: data.cep ? String(data.cep) : f.cep,
        address: data.logradouro || f.address,
        address_number: data.numero ? String(data.numero) : f.address_number,
        city: data.municipio || f.city,
        state: data.uf || f.state,
      }));
      toast.success("Dados do CNPJ preenchidos.");
    } catch {
      toast.error("Não foi possível buscar o CNPJ.");
    } finally {
      setCnpjLoading(false);
    }
  }

  async function handleSave() {
    if (!session?.user?.id) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    setSaving(true);
    try {
      const commercial = form.commercial_phone.trim() || null;
      const mobile = form.mobile_phone.trim() || null;
      const payload = {
        name: form.name.trim(),
        customer_type: form.customer_type,
        commercial_phone: commercial,
        mobile_phone: mobile,
        // mantém compatibilidade com campos antigos
        phone: commercial,
        whatsapp: mobile,
        email: form.email.trim() || null,
        document:
          (form.customer_type === "pessoa_juridica"
            ? fmtCNPJ(form.document.trim())
            : fmtCPF(form.document.trim())) || form.document.trim() || null,
        cep: form.cep.trim() || null,
        address: form.address.trim() || null,
        address_number: form.address_number.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        state_registration: form.state_registration.trim() || null,
        notes: form.notes.trim() || null,
      };

      // Duplicado somente quando TODOS os campos principais forem idênticos
      const key = clientDedupeKey(payload);
      let existsQuery = supabase
        .from("clients")
        .select(
          "id, name, document, phone, whatsapp, commercial_phone, mobile_phone, email, address, address_number, cep, city, state",
        )
        .eq("name", payload.name)
        .limit(200);
      if (form.id) existsQuery = existsQuery.neq("id", form.id);
      const { data: candidates } = await existsQuery;
      if ((candidates ?? []).some((c: any) => clientDedupeKey(c) === key)) {
        toast.error("Já existe um cliente idêntico cadastrado.");
        setSaving(false);
        return;
      }

      if (form.id) {
        const { error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
        toast.success("Cliente atualizado.");
        logAct({ action: "client.updated", entity: "client", entityId: form.id, description: `Editou o cliente ${payload.name}.` });
      } else {
        const { error } = await supabase.from("clients").insert({
          user_id: ownerUserId ?? session.user.id,
          ...payload,
        });
        if (error) throw error;
        toast.success("Cliente criado.");
        logAct({ action: "client.created", entity: "client", description: `Cadastrou o cliente ${payload.name}.` });
      }
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["clients", "picker"] });
      setDialogOpen(false);
      setForm(emptyForm);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível salvar o cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    const { error } = await supabase.from("clients").delete().eq("id", deleting.id);
    if (error) {
      toast.error("Não foi possível excluir o cliente.");
    } else {
      toast.success("Cliente excluído.");
      logAct({ action: "client.deleted", entity: "client", entityId: deleting.id, description: `Excluiu o cliente ${deleting.name}.` });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["clients", "picker"] });
    }
    setDeleting(null);
  }

  async function handleDeleteAll() {
    const owner = ownerUserId ?? session?.user?.id;
    if (!owner) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }
    setDeletingAll(true);
    try {
      const { error } = await supabase.from("clients").delete().eq("user_id", owner);
      if (error) throw error;
      setPage(1);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["clients", "picker"] });
      toast.success("Todos os clientes foram excluídos.");
      logAct({ action: "client.deleted", entity: "client", description: "Excluiu todos os clientes da empresa." });
      setDeleteAllOpen(false);
      setDeleteAllText("");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível excluir os clientes.");
    } finally {
      setDeletingAll(false);
    }
  }


  const isPJ = form.customer_type === "pessoa_juridica";

  return (
    <AppShell title="Clientes" subtitle="Cadastro e gestão de clientes">
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-2">
          <div className="relative w-full sm:max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone ou CPF/CNPJ..."
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {canCreateClients && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="h-4 w-4 mr-1.5" /> Importar Clientes
              </Button>
              <Button
                variant="outline"
                className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  setDeleteAllText("");
                  setDeleteAllOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1.5" /> Excluir Todos
              </Button>
              <Button
                onClick={openCreate}
                className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Novo Cliente
              </Button>
            </div>
          )}
        </div>

        <p className="text-sm text-muted-foreground mb-5">
          {totalCount.toLocaleString("pt-BR")}{" "}
          {term ? "cliente(s) encontrado(s)" : "clientes cadastrados"}
        </p>




        <TooltipProvider delayDuration={200}>
        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
                <th className="font-medium py-3 px-6">Nome</th>
                <th className="font-medium py-3 px-3">Tipo</th>
                <th className="font-medium py-3 px-3">Telefone comercial</th>
                <th className="font-medium py-3 px-3">Telefone celular</th>
                <th className="font-medium py-3 px-3">CPF/CNPJ</th>
                <th className="font-medium py-3 px-3">E-mail</th>
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
                    Nenhum cliente cadastrado.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40 transition">
                    <td className="py-3.5 px-6 font-medium">{c.name}</td>
                    <td className="py-3.5 px-3 text-muted-foreground">
                      {customerTypeLabel(c.customer_type)}
                    </td>
                    <td className="py-3.5 px-3 text-muted-foreground">
                      {c.commercial_phone || c.phone || "—"}
                    </td>
                    <td className="py-3.5 px-3 text-muted-foreground">
                      {c.mobile_phone || c.whatsapp || "—"}
                    </td>
                    <td className="py-3.5 px-3 text-muted-foreground">
                      {c.document || "—"}
                    </td>
                    <td className="py-3.5 px-3 text-muted-foreground">
                      {c.email || "—"}
                    </td>
                    <td className="py-3.5 px-6">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Visualizar"
                              onClick={() => setViewing(c)}
                            >
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Visualizar</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Editar"
                              onClick={() => openEdit(c)}
                            >
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              aria-label="Excluir"
                              onClick={() => setDeleting(c)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Excluir</TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        </TooltipProvider>

        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            {pageNumbers.map((n, i) =>
              n === "…" ? (
                <span key={`e${i}`} className="px-2 text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={n}
                  size="sm"
                  variant={n === page ? "default" : "outline"}
                  onClick={() => setPage(n as number)}
                >
                  {n}
                </Button>
              ),
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próximo
            </Button>
          </div>
        )}
      </Card>

      <Dialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir todos os clientes?</DialogTitle>
            <DialogDescription>
              Esta ação removerá permanentemente todos os clientes cadastrados
              nesta empresa. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="del-all">
              Para confirmar, digite <b>EXCLUIR</b>
            </Label>
            <Input
              id="del-all"
              value={deleteAllText}
              onChange={(e) => setDeleteAllText(e.target.value)}
              placeholder="EXCLUIR"
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAllOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteAllText !== "EXCLUIR" || deletingAll}
              onClick={handleDeleteAll}
            >
              {deletingAll ? "Excluindo..." : "Excluir todos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
            <DialogDescription>
              Preencha as informações do cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
            <div className="space-y-1.5 sm:col-span-6">
              <Label>Tipo de cliente *</Label>
              <RadioGroup
                value={form.customer_type}
                onValueChange={(v) =>
                  setForm({ ...form, customer_type: v as CustomerType })
                }
                className="flex flex-col sm:flex-row gap-3"
              >
                <label className="flex items-center gap-2 cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-accent transition">
                  <RadioGroupItem value="pessoa_fisica" id="ct-pf" />
                  <span className="text-sm">Pessoa Física</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-accent transition">
                  <RadioGroupItem value="pessoa_juridica" id="ct-pj" />
                  <span className="text-sm">Pessoa Jurídica</span>
                </label>
              </RadioGroup>
            </div>

            {isPJ && (
              <div className="space-y-1.5 sm:col-span-6">
                <Label htmlFor="cli-cnpj">CNPJ</Label>
                <div className="flex gap-2">
                  <Input
                    id="cli-cnpj"
                    value={form.document}
                    onChange={(e) => setForm({ ...form, document: e.target.value })}
                    onBlur={(e) => {
                      const v = onlyDigits(e.target.value);
                      if (v.length === 14) {
                        setForm((f) => ({ ...f, document: fmtCNPJ(v) }));
                        lookupCnpj(v);
                      }
                    }}
                    placeholder="00.000.000/0000-00"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => lookupCnpj(form.document)}
                    disabled={cnpjLoading}
                  >
                    {cnpjLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Buscar"
                    )}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5 sm:col-span-6">
              <Label htmlFor="cli-name">Nome *</Label>
              <Input
                id="cli-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })}
                placeholder={isPJ ? "RAZÃO SOCIAL / NOME FANTASIA" : "NOME DO CLIENTE"}
              />

            </div>

            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="cli-comm">Telefone comercial</Label>
              <Input
                id="cli-comm"
                value={form.commercial_phone}
                onChange={(e) =>
                  setForm({ ...form, commercial_phone: e.target.value })
                }
                placeholder="(00) 0000-0000"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="cli-mob">Telefone celular</Label>
              <Input
                id="cli-mob"
                value={form.mobile_phone}
                onChange={(e) => setForm({ ...form, mobile_phone: e.target.value })}
                placeholder="(00) 90000-0000"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="cli-email">E-mail</Label>
              <Input
                id="cli-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@exemplo.com"
              />
            </div>
            {!isPJ && (
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="cli-doc">CPF</Label>
                <Input
                  id="cli-doc"
                  value={form.document}
                  onChange={(e) => setForm({ ...form, document: e.target.value })}
                  onBlur={(e) => {
                    const v = onlyDigits(e.target.value);
                    if (v.length === 11) {
                      setForm((f) => ({ ...f, document: fmtCPF(v) }));
                    }
                  }}
                  placeholder="000.000.000-00"
                />
              </div>
            )}

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cli-cep">CEP</Label>
              <div className="relative">
                <Input
                  id="cli-cep"
                  value={form.cep}
                  onChange={(e) => setForm({ ...form, cep: e.target.value })}
                  onBlur={(e) => lookupCep(e.target.value)}
                  placeholder="00000-000"
                />
                {cepLoading && (
                  <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="cli-addr">Rua</Label>
              <Input
                id="cli-addr"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Rua/Avenida"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="cli-num">Número</Label>
              <Input
                id="cli-num"
                value={form.address_number}
                onChange={(e) =>
                  setForm({ ...form, address_number: e.target.value })
                }
                placeholder="123"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-4">
              <Label htmlFor="cli-city">Cidade</Label>
              <Input
                id="cli-city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Cidade"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cli-uf">UF</Label>
              <Input
                id="cli-uf"
                value={form.state}
                onChange={(e) =>
                  setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })
                }
                placeholder="SP"
                maxLength={2}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="cli-ie">Inscrição Estadual</Label>
              <Input
                id="cli-ie"
                value={form.state_registration}
                onChange={(e) =>
                  setForm({ ...form, state_registration: e.target.value.toUpperCase() })
                }
                placeholder="ISENTO / 000.000.000.000"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-6">
              <Label htmlFor="cli-notes">Observações</Label>
              <Textarea
                id="cli-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value.toUpperCase() })}
              />

            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O cliente "{deleting?.name}" será
              removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>
              {viewing ? customerTypeLabel(viewing.customer_type) : ""}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {[
                ["CPF/CNPJ", viewing.document],
                ["Inscrição Estadual", viewing.state_registration],
                ["Telefone comercial", viewing.commercial_phone || viewing.phone],
                ["Telefone celular", viewing.mobile_phone || viewing.whatsapp],
                ["E-mail", viewing.email],
                ["CEP", viewing.cep],
                ["Endereço", viewing.address],
                ["Número", viewing.address_number],
                ["Cidade", viewing.city],
                ["UF", viewing.state],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p className="font-medium break-words">{value || "—"}</p>
                </div>
              ))}
              {viewing.notes && (
                <div className="col-span-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Observações
                  </p>
                  <p className="whitespace-pre-wrap">{viewing.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>
              Fechar
            </Button>
            {viewing && canCreateClients && (
              <Button
                onClick={() => {
                  const c = viewing;
                  setViewing(null);
                  openEdit(c);
                }}
              >
                <Pencil className="h-4 w-4 mr-1.5" /> Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClientImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: ["clients"] });
        }}
      />
    </AppShell>
  );
}
