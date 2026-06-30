import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/arquitetos")({
  head: () => ({ meta: [{ title: "Arquitetos — Total Maxx ERP" }] }),
  component: Arquitetos,
});

type ArchitectRow = {
  id: string;
  name: string;
  phone: string | null;
  document: string | null;
  email: string | null;
  percentage: number;
  created_at: string;
};

type FormState = {
  id?: string;
  name: string;
  phone: string;
  document: string;
  email: string;
  percentage: string;
};

const emptyForm: FormState = {
  name: "",
  phone: "",
  document: "",
  email: "",
  percentage: "",
};

function parsePct(s: string): number {
  const n = Number(String(s).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function Arquitetos() {
  const { session, ownerUserId } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ArchitectRow | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["architects"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("architects")
        .select("id, name, phone, document, email, percentage, created_at")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ArchitectRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.phone ?? "").toLowerCase().includes(q) ||
        (a.document ?? "").toLowerCase().includes(q) ||
        (a.email ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  function openCreate() {
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(a: ArchitectRow) {
    setForm({
      id: a.id,
      name: a.name ?? "",
      phone: a.phone ?? "",
      document: a.document ?? "",
      email: a.email ?? "",
      percentage: a.percentage != null ? String(a.percentage).replace(".", ",") : "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!session?.user?.id) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Informe o nome do arquiteto.");
      return;
    }
    const pct = parsePct(form.percentage);
    if (!form.percentage.trim() || pct <= 0) {
      toast.error("Informe a porcentagem do arquiteto (RT).");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        document: form.document.trim() || null,
        email: form.email.trim() || null,
        percentage: pct,
      };
      if (form.id) {
        const { error } = await supabase
          .from("architects")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
        toast.success("Arquiteto atualizado.");
      } else {
        const { error } = await supabase.from("architects").insert({
          user_id: ownerUserId ?? session.user.id,
          ...payload,
        });
        if (error) throw error;
        toast.success("Arquiteto criado.");
      }
      await queryClient.invalidateQueries({ queryKey: ["architects"] });
      await queryClient.invalidateQueries({ queryKey: ["architects", "picker"] });
      setDialogOpen(false);
      setForm(emptyForm);
    } catch (e) {
      console.error(e);
      toast.error(
        e instanceof Error ? e.message : "Não foi possível salvar o arquiteto.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    const { error } = await supabase.from("architects").delete().eq("id", deleting.id);
    if (error) {
      toast.error("Não foi possível excluir o arquiteto.");
    } else {
      toast.success("Arquiteto excluído.");
      await queryClient.invalidateQueries({ queryKey: ["architects"] });
      await queryClient.invalidateQueries({ queryKey: ["architects", "picker"] });
    }
    setDeleting(null);
  }

  return (
    <AppShell
      title="Arquitetos"
      subtitle="Cadastro de arquitetos e comissões técnicas (RT)"
    >
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
          <div className="relative w-full sm:max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone, CPF ou e-mail..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            onClick={openCreate}
            className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Novo Arquiteto
          </Button>
        </div>

        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
                <th className="font-medium py-3 px-6">Nome</th>
                <th className="font-medium py-3 px-3">Telefone</th>
                <th className="font-medium py-3 px-3">CPF</th>
                <th className="font-medium py-3 px-3">E-mail</th>
                <th className="font-medium py-3 px-3">% RT</th>
                <th className="font-medium py-3 px-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhum arquiteto cadastrado.
                  </td>
                </tr>
              ) : (
                filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/40 transition">
                    <td className="py-3.5 px-6 font-medium">{a.name}</td>
                    <td className="py-3.5 px-3 text-muted-foreground">
                      {a.phone || "—"}
                    </td>
                    <td className="py-3.5 px-3 text-muted-foreground">
                      {a.document || "—"}
                    </td>
                    <td className="py-3.5 px-3 text-muted-foreground">
                      {a.email || "—"}
                    </td>
                    <td className="py-3.5 px-3 font-medium">
                      {Number(a.percentage).toFixed(2).replace(".", ",")}%
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
                          <DropdownMenuItem onClick={() => openEdit(a)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleting(a)}
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
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar Arquiteto" : "Novo Arquiteto"}</DialogTitle>
            <DialogDescription>
              A porcentagem cadastrada será aplicada como RT / Comissão Técnica nos orçamentos.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
            <div className="space-y-1.5 sm:col-span-6">
              <Label htmlFor="arq-name">Nome do arquiteto *</Label>
              <Input
                id="arq-name"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value.toUpperCase() })
                }
                placeholder="NOME DO ARQUITETO"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="arq-phone">Telefone</Label>
              <Input
                id="arq-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(00) 90000-0000"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="arq-doc">CPF</Label>
              <Input
                id="arq-doc"
                value={form.document}
                onChange={(e) => setForm({ ...form, document: e.target.value })}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-4">
              <Label htmlFor="arq-email">E-mail</Label>
              <Input
                id="arq-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="arq-pct">Porcentagem (%) *</Label>
              <Input
                id="arq-pct"
                inputMode="decimal"
                value={form.percentage}
                onChange={(e) => setForm({ ...form, percentage: e.target.value })}
                placeholder="15"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
            >
              {saving ? "Salvando..." : form.id ? "Salvar alterações" : "Criar arquiteto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir arquiteto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. {deleting?.name} será removido permanentemente.
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
