import { createFileRoute } from "@tanstack/react-router";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Total Maxx ERP" }] }),
  component: Clientes,
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
  address: string | null;
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
  address: string;
  notes: string;
};

const emptyForm: FormState = {
  name: "",
  customer_type: "pessoa_fisica",
  commercial_phone: "",
  mobile_phone: "",
  email: "",
  document: "",
  address: "",
  notes: "",
};

const customerTypeLabel = (t: string) =>
  t === "pessoa_juridica" ? "Pessoa Jurídica" : "Pessoa Física";

function Clientes() {
  const { session, ownerUserId } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ClientRow | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["clients"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, name, customer_type, commercial_phone, mobile_phone, phone, whatsapp, email, document, address, notes, created_at",
        )
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.commercial_phone ?? c.phone ?? "").toLowerCase().includes(q) ||
        (c.mobile_phone ?? c.whatsapp ?? "").toLowerCase().includes(q) ||
        (c.document ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

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
      address: c.address ?? "",
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
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
        document: form.document.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (form.id) {
        const { error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
        toast.success("Cliente atualizado.");
      } else {
        const { error } = await supabase.from("clients").insert({
          user_id: ownerUserId ?? session.user.id,
          ...payload,
        });
        if (error) throw error;
        toast.success("Cliente criado.");
      }
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
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
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      await queryClient.invalidateQueries({ queryKey: ["clients", "picker"] });
    }
    setDeleting(null);
  }

  return (
    <AppShell title="Clientes" subtitle="Cadastro e gestão de clientes">
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
          <div className="relative w-full sm:max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone ou CPF/CNPJ..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            onClick={openCreate}
            className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Novo Cliente
          </Button>
        </div>

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
                          <DropdownMenuItem onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleting(c)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
            <DialogDescription>
              Preencha as informações do cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
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
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cli-name">Nome *</Label>
              <Input
                id="cli-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nome do cliente"
              />
            </div>
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <Label htmlFor="cli-mob">Telefone celular</Label>
              <Input
                id="cli-mob"
                value={form.mobile_phone}
                onChange={(e) => setForm({ ...form, mobile_phone: e.target.value })}
                placeholder="(00) 90000-0000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cli-email">E-mail</Label>
              <Input
                id="cli-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cli-doc">
                {form.customer_type === "pessoa_juridica" ? "CNPJ" : "CPF"}
              </Label>
              <Input
                id="cli-doc"
                value={form.document}
                onChange={(e) => setForm({ ...form, document: e.target.value })}
                placeholder={
                  form.customer_type === "pessoa_juridica"
                    ? "00.000.000/0000-00"
                    : "000.000.000-00"
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cli-addr">Endereço</Label>
              <Input
                id="cli-addr"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Rua, número, bairro, cidade"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cli-notes">Observações</Label>
              <Textarea
                id="cli-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
    </AppShell>
  );
}
