import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Search,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Globe2,
  Building2,
  Eye,
  PackagePlus,

} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { fmtCNPJ, fmtCEP, onlyDigits } from "@/lib/utils";
import { SUPPLIER_CATEGORIES } from "@/components/suppliers/SupplierPicker";
import { ProductImportWizard } from "@/components/produtos/ProductImportWizard";


export const Route = createFileRoute("/fornecedores")({
  head: () => ({
    meta: [
      { title: "Fornecedores — Total Maxx ERP" },
      {
        name: "description",
        content:
          "Cadastro central de fornecedores da empresa: dados fiscais, contato, categorias e disponibilidade global ou individual.",
      },
    ],
  }),
  component: Fornecedores,
});

type SupplierRow = {
  id: string;
  user_id: string | null;
  is_global: boolean;
  legal_name: string | null;
  trade_name: string | null;
  document: string | null;
  state_registration: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  site: string | null;
  cep: string | null;
  address: string | null;
  address_number: string | null;
  city: string | null;
  state: string | null;
  contact_name: string | null;
  notes: string | null;
  categories: string[];
  active: boolean;
  publish_catalog: boolean;
  created_at: string;
};

type FormState = {
  id?: string;
  is_global: boolean;
  legal_name: string;
  trade_name: string;
  document: string;
  state_registration: string;
  email: string;
  phone: string;
  whatsapp: string;
  site: string;
  cep: string;
  address: string;
  address_number: string;
  city: string;
  state: string;
  contact_name: string;
  notes: string;
  categories: string[];
  active: boolean;
  publish_catalog: boolean;
};

const emptyForm: FormState = {
  is_global: false,
  legal_name: "",
  trade_name: "",
  document: "",
  state_registration: "",
  email: "",
  phone: "",
  whatsapp: "",
  site: "",
  cep: "",
  address: "",
  address_number: "",
  city: "",
  state: "",
  contact_name: "",
  notes: "",
  categories: [],
  active: true,
  publish_catalog: false,
};


function fmtPhoneBR(raw: string): string {
  const d = onlyDigits(raw);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

function Fornecedores() {
  const { session, role, ownerUserId } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "admin";

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<SupplierRow | null>(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [catalogFor, setCatalogFor] = useState<SupplierRow | null>(null);
  const [deleteCatalogFor, setDeleteCatalogFor] = useState<SupplierRow | null>(null);
  const [deletingCatalog, setDeletingCatalog] = useState(false);


  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("is_global", { ascending: false })
        .order("trade_name", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as SupplierRow[];
    },
  });

  // Contagem de produtos globais por fornecedor + categorias e amostra.
  type GlobalCatalog = {
    total: number;
    categories: Record<string, number>;
    sample: Array<{ id: string; code: string; description: string; category: string; base_price: number | null; width_cm: number | null }>;
  };
  const { data: catalogBySupplier = {} } = useQuery<Record<string, GlobalCatalog>>({
    queryKey: ["global-catalog-by-supplier"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("global_supplier_products")
        .select("id, supplier_id, code, description, category, base_price, width_cm")
        .eq("active", true)
        .order("code", { ascending: true });
      if (error) throw error;
      const acc: Record<string, GlobalCatalog> = {};
      for (const r of (data ?? []) as Array<{ id: string; supplier_id: string; code: string; description: string; category: string; base_price: number | null; width_cm: number | null }>) {
        const bucket = acc[r.supplier_id] ?? (acc[r.supplier_id] = { total: 0, categories: {}, sample: [] });
        bucket.total += 1;
        bucket.categories[r.category] = (bucket.categories[r.category] ?? 0) + 1;
        if (bucket.sample.length < 300) bucket.sample.push(r);
      }
      return acc;
    },
  });

  const invalidateAllCatalog = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["suppliers"] }),
      qc.invalidateQueries({ queryKey: ["suppliers", "picker"] }),
      qc.invalidateQueries({ queryKey: ["global-catalog-by-supplier"] }),
      qc.invalidateQueries({ queryKey: ["products"] }),
      qc.invalidateQueries({ queryKey: ["supplier-wizard-state"] }),
    ]);
  };

  async function handleDeleteGlobalCatalog() {
    if (!deleteCatalogFor || !isAdmin) return;
    setDeletingCatalog(true);
    try {
      const { error } = await supabase
        .from("global_supplier_products")
        .delete()
        .eq("supplier_id", deleteCatalogFor.id);
      if (error) throw error;
      toast.success("Catálogo global excluído. Pedidos e orçamentos históricos foram preservados.");
      await invalidateAllCatalog();
      setDeleteCatalogFor(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir catálogo global.");
    } finally {
      setDeletingCatalog(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const inCat = (r.categories ?? []).some((c) => c.toLowerCase().includes(q));
      return (
        (r.trade_name ?? "").toLowerCase().includes(q) ||
        (r.legal_name ?? "").toLowerCase().includes(q) ||
        (r.document ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        (r.contact_name ?? "").toLowerCase().includes(q) ||
        inCat
      );
    });
  }, [rows, search]);


  const canEdit = (r: SupplierRow) =>
    isAdmin ? true : !r.is_global && r.user_id === ownerUserId;

  function openCreate() {
    setForm({ ...emptyForm, is_global: false });
    setReadOnly(false);
    setDialogOpen(true);
  }

  function openEdit(r: SupplierRow, viewOnly = false) {
    setForm({
      id: r.id,
      is_global: r.is_global,
      legal_name: r.legal_name ?? "",
      trade_name: r.trade_name ?? "",
      document: r.document ?? "",
      state_registration: r.state_registration ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      whatsapp: r.whatsapp ?? "",
      site: r.site ?? "",
      cep: r.cep ?? "",
      address: r.address ?? "",
      address_number: r.address_number ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      contact_name: r.contact_name ?? "",
      notes: r.notes ?? "",
      categories: r.categories ?? [],
      active: r.active,
      publish_catalog: r.publish_catalog ?? false,

    });
    setReadOnly(viewOnly);
    setDialogOpen(true);
  }

  async function lookupCep(rawCep: string) {
    const cep = onlyDigits(rawCep);
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) return toast.warning("CEP não encontrado.");
      setForm((f) => ({
        ...f,
        cep: fmtCEP(cep),
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
    if (cnpj.length !== 14) return toast.warning("Informe um CNPJ válido (14 dígitos).");
    setCnpjLoading(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!res.ok) return toast.warning("CNPJ não encontrado.");
      const data = await res.json();
      setForm((f) => ({
        ...f,
        document: fmtCNPJ(cnpj),
        legal_name: f.legal_name.trim() || (data.razao_social ?? "").toUpperCase(),
        trade_name: f.trade_name.trim() || (data.nome_fantasia ?? "").toUpperCase(),
        cep: data.cep ? fmtCEP(String(data.cep)) : f.cep,
        address: data.logradouro || f.address,
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

  function toggleCategory(cat: string, checked: boolean) {
    setForm((f) => ({
      ...f,
      categories: checked
        ? Array.from(new Set([...f.categories, cat]))
        : f.categories.filter((c) => c !== cat),
    }));
  }

  async function handleSave() {
    if (!session?.user?.id) return toast.error("Sessão expirada.");
    if (!form.legal_name.trim() && !form.trade_name.trim()) {
      return toast.error("Informe a razão social ou o nome fantasia.");
    }
    if (form.document.trim() && onlyDigits(form.document).length !== 14) {
      return toast.error("CNPJ inválido.");
    }
    setSaving(true);
    try {
      const payload: any = {
        is_global: isAdmin ? form.is_global : false,
        user_id: (isAdmin && form.is_global) ? null : (ownerUserId ?? session.user.id),
        legal_name: form.legal_name.trim() || null,
        trade_name: form.trade_name.trim() || null,
        document: form.document.trim() ? fmtCNPJ(onlyDigits(form.document)) : null,
        state_registration: form.state_registration.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() ? fmtPhoneBR(form.phone) : null,
        whatsapp: form.whatsapp.trim() ? fmtPhoneBR(form.whatsapp) : null,
        site: form.site.trim() || null,
        cep: form.cep.trim() ? fmtCEP(form.cep) : null,
        address: form.address.trim() || null,
        address_number: form.address_number.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() ? form.state.trim().toUpperCase().slice(0, 2) : null,
        contact_name: form.contact_name.trim() || null,
        notes: form.notes.trim() || null,
        categories: form.categories,
        active: form.active,
        publish_catalog: isAdmin && form.is_global ? form.publish_catalog : false,

      };
      if (form.id) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", form.id);
        if (error) throw error;
        toast.success("Fornecedor atualizado.");
      } else {
        const { error } = await supabase.from("suppliers").insert(payload);
        if (error) throw error;
        toast.success("Fornecedor cadastrado.");
      }
      await qc.invalidateQueries({ queryKey: ["suppliers"] });
      await qc.invalidateQueries({ queryKey: ["suppliers", "picker"] });
      setDialogOpen(false);
      setForm(emptyForm);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar fornecedor.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", deleting.id);
    if (error) {
      toast.error("Não foi possível excluir o fornecedor.");
    } else {
      toast.success(
        deleting.is_global
          ? "Fornecedor global removido de todas as empresas."
          : "Fornecedor excluído.",
      );
      await qc.invalidateQueries({ queryKey: ["suppliers"] });
      await qc.invalidateQueries({ queryKey: ["suppliers", "picker"] });
      await qc.invalidateQueries({ queryKey: ["products"] });
    }
    setDeleting(null);
  }

  return (
    <AppShell
      title="Fornecedores"
      subtitle="Cadastre e gerencie os fornecedores utilizados pela sua empresa."
    >
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
          <div className="relative w-full sm:max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CNPJ, categoria..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            onClick={openCreate}
            className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Novo Fornecedor
          </Button>
        </div>

        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
                <th className="font-medium py-3 px-6">Nome</th>
                <th className="font-medium py-3 px-3">CNPJ</th>
                <th className="font-medium py-3 px-3">Telefone</th>
                <th className="font-medium py-3 px-3">Categorias</th>
                <th className="font-medium py-3 px-3">Disponibilidade</th>
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
                    Nenhum fornecedor cadastrado.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const editable = canEdit(r);
                  return (
                    <tr key={r.id} className="hover:bg-muted/40 transition">
                      <td className="py-3.5 px-6 font-medium">
                        <div>{r.trade_name || r.legal_name || "—"}</div>
                        {r.trade_name && r.legal_name && (
                          <div className="text-xs text-muted-foreground">{r.legal_name}</div>
                        )}
                        {r.is_global && r.publish_catalog && (
                          <div className="text-xs text-emerald-700 mt-0.5">
                            {(catalogBySupplier[r.id]?.total ?? 0)} produtos globais
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-muted-foreground">{r.document || "—"}</td>
                      <td className="py-3.5 px-3 text-muted-foreground">{r.phone || r.whatsapp || "—"}</td>
                      <td className="py-3.5 px-3 text-muted-foreground">
                        <div className="flex flex-wrap gap-1">
                          {(r.categories ?? []).length === 0 ? (
                            "—"
                          ) : (
                            (r.categories ?? []).slice(0, 3).map((c) => {
                              const label =
                                SUPPLIER_CATEGORIES.find((k) => k.key === c)?.label ?? c;
                              return (
                                <Badge key={c} variant="outline" className="text-[10px]">
                                  {label}
                                </Badge>
                              );
                            })
                          )}
                          {(r.categories ?? []).length > 3 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{(r.categories ?? []).length - 3}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        {r.is_global ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 gap-1">
                            <Globe2 className="h-3 w-3" /> Global
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Building2 className="h-3 w-3" /> Individual
                          </Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex justify-end gap-1">
                          {isAdmin && r.is_global && r.publish_catalog && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-700 hover:text-emerald-800"
                              onClick={() => setCatalogFor(r)}
                              title="Gerenciar catálogo global"
                            >
                              <PackagePlus className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(r, !editable)}
                            title={editable ? "Editar" : "Visualizar (somente leitura)"}
                          >
                            {editable ? (
                              <Pencil className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                          {editable && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleting(r)}
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>

                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {readOnly
                ? "Visualizar fornecedor (somente leitura)"
                : form.id ? "Editar fornecedor" : "Novo fornecedor"}
            </DialogTitle>
            <DialogDescription>
              {readOnly
                ? "Este é um fornecedor global. Apenas o administrador pode editá-lo."
                : "Preencha ao menos a razão social ou o nome fantasia. CNPJ é opcional."}
            </DialogDescription>
          </DialogHeader>

          <fieldset
            disabled={readOnly}
            className={
              "grid grid-cols-1 sm:grid-cols-6 gap-4 min-w-0 " +
              (readOnly
                ? "[&_input]:cursor-not-allowed [&_textarea]:cursor-not-allowed [&_button]:cursor-not-allowed [&_[role=checkbox]]:cursor-not-allowed [&_[role=radio]]:cursor-not-allowed [&_label]:cursor-not-allowed opacity-95"
                : "")
            }
          >
            {isAdmin && (
              <div className="sm:col-span-6 space-y-2 border rounded-md p-3 bg-muted/30">
                <Label className="text-sm font-semibold">Disponibilidade do fornecedor *</Label>
                <RadioGroup
                  value={form.is_global ? "global" : "individual"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, is_global: v === "global" }))
                  }
                  className="space-y-2"
                >
                  <label className="flex items-start gap-2 cursor-pointer">
                    <RadioGroupItem value="global" className="mt-1" />
                    <div>
                      <div className="text-sm font-medium">Global</div>
                      <div className="text-xs text-muted-foreground">
                        Este fornecedor ficará disponível para todas as empresas do sistema.
                      </div>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <RadioGroupItem value="individual" className="mt-1" />
                    <div>
                      <div className="text-sm font-medium">Somente nesta conta</div>
                      <div className="text-xs text-muted-foreground">
                        Este fornecedor ficará disponível apenas para a conta do Admin.
                      </div>
                    </div>
                  </label>
                </RadioGroup>
                {form.is_global && (
                  <label className="flex items-start gap-2 pt-2 border-t cursor-pointer">
                    <Checkbox
                      checked={form.publish_catalog}
                      onCheckedChange={(v) =>
                        setForm((f) => ({ ...f, publish_catalog: Boolean(v) }))
                      }
                      className="mt-1"
                    />
                    <div>
                      <div className="text-sm font-medium">Publicar catálogo padrão</div>
                      <div className="text-xs text-muted-foreground">
                        Ao ativar, os produtos importados neste fornecedor ficarão visíveis para
                        todas as empresas. Você poderá gerenciar o catálogo após salvar.
                      </div>
                    </div>
                  </label>
                )}
              </div>
            )}


            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="sup-legal">Razão social</Label>
              <Input
                id="sup-legal"
                value={form.legal_name}
                onChange={(e) => setForm({ ...form, legal_name: e.target.value.toUpperCase() })}
                placeholder="RAZÃO SOCIAL LTDA"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="sup-trade">Nome fantasia</Label>
              <Input
                id="sup-trade"
                value={form.trade_name}
                onChange={(e) => setForm({ ...form, trade_name: e.target.value.toUpperCase() })}
                placeholder="NOME FANTASIA"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-4">
              <Label htmlFor="sup-cnpj">CNPJ</Label>
              <div className="flex gap-2">
                <Input
                  id="sup-cnpj"
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
                  {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sup-ie">Inscrição estadual</Label>
              <Input
                id="sup-ie"
                value={form.state_registration}
                onChange={(e) => setForm({ ...form, state_registration: e.target.value })}
                placeholder="000.000.000.000"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sup-email">E-mail</Label>
              <Input
                id="sup-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sup-phone">Telefone</Label>
              <Input
                id="sup-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                onBlur={(e) => {
                  const v = onlyDigits(e.target.value);
                  if (v.length === 10 || v.length === 11) {
                    setForm((f) => ({ ...f, phone: fmtPhoneBR(v) }));
                  }
                }}
                placeholder="(00) 0000-0000"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sup-wa">WhatsApp</Label>
              <Input
                id="sup-wa"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                onBlur={(e) => {
                  const v = onlyDigits(e.target.value);
                  if (v.length === 10 || v.length === 11) {
                    setForm((f) => ({ ...f, whatsapp: fmtPhoneBR(v) }));
                  }
                }}
                placeholder="(00) 90000-0000"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="sup-contact">Nome do contato</Label>
              <Input
                id="sup-contact"
                value={form.contact_name}
                maxLength={100}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                placeholder="Ex.: João Silva"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="sup-site">Site</Label>
              <Input
                id="sup-site"
                value={form.site}
                onChange={(e) => setForm({ ...form, site: e.target.value })}
                placeholder="https://..."
              />
            </div>


            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sup-cep">CEP</Label>
              <div className="relative">
                <Input
                  id="sup-cep"
                  value={form.cep}
                  onChange={(e) => setForm({ ...form, cep: e.target.value })}
                  onBlur={(e) => lookupCep(e.target.value)}
                  placeholder="00000-000"
                />
                {cepLoading && (
                  <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                )}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="sup-addr">Rua</Label>
              <Input
                id="sup-addr"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="sup-num">Número</Label>
              <Input
                id="sup-num"
                value={form.address_number}
                onChange={(e) => setForm({ ...form, address_number: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-4">
              <Label htmlFor="sup-city">Cidade</Label>
              <Input
                id="sup-city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sup-uf">UF</Label>
              <Input
                id="sup-uf"
                maxLength={2}
                value={form.state}
                onChange={(e) =>
                  setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })
                }
              />
            </div>

            <div className="sm:col-span-6 space-y-2">
              <Label>Categorias fornecidas</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SUPPLIER_CATEGORIES.map((c) => {
                  const checked = form.categories.includes(c.key);
                  return (
                    <label
                      key={c.key}
                      className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-accent"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleCategory(c.key, !!v)}
                      />
                      <span className="text-sm">{c.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="sm:col-span-6 space-y-1.5">
              <Label htmlFor="sup-notes">Observações</Label>
              <Textarea
                id="sup-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </fieldset>

          {form.id && form.is_global && (() => {
            const cat = catalogBySupplier[form.id!];
            const total = cat?.total ?? 0;
            const cats = cat ? Object.entries(cat.categories) : [];
            return (
              <div className="mt-4 border rounded-md p-3 sm:p-4 bg-muted/20 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">Produtos globais</div>
                    <div className="text-xs text-muted-foreground">
                      {total} produto{total === 1 ? "" : "s"} vinculado{total === 1 ? "" : "s"} a este fornecedor.
                    </div>
                  </div>
                  {isAdmin && total > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/40 hover:bg-destructive/5"
                      onClick={() => {
                        const row = rows.find((r) => r.id === form.id);
                        if (row) setDeleteCatalogFor(row);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" /> Excluir produtos globais
                    </Button>
                  )}
                </div>
                {cats.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cats.map(([c, n]) => (
                      <Badge key={c} variant="outline" className="text-[11px]">
                        {c} · {n}
                      </Badge>
                    ))}
                  </div>
                )}
                {total > 0 ? (
                  <div className="max-h-64 overflow-y-auto border rounded-md bg-background">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr className="text-left text-muted-foreground">
                          <th className="py-1.5 px-2 font-medium">Código</th>
                          <th className="py-1.5 px-2 font-medium">Descrição</th>
                          <th className="py-1.5 px-2 font-medium">Categoria</th>
                          <th className="py-1.5 px-2 font-medium text-right">Preço-base</th>
                          <th className="py-1.5 px-2 font-medium text-right">Largura</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(cat?.sample ?? []).map((p) => (
                          <tr key={p.id}>
                            <td className="py-1.5 px-2 font-mono">{p.code}</td>
                            <td className="py-1.5 px-2">{p.description}</td>
                            <td className="py-1.5 px-2 text-muted-foreground">{p.category}</td>
                            <td className="py-1.5 px-2 text-right">
                              {p.base_price != null
                                ? p.base_price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                                : "—"}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              {p.width_cm != null ? `${p.width_cm} cm` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {total > (cat?.sample.length ?? 0) && (
                      <div className="py-1.5 px-2 text-[11px] text-muted-foreground border-t bg-muted/30">
                        Exibindo {cat?.sample.length} de {total} produtos.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Nenhum produto global cadastrado neste fornecedor.
                  </div>
                )}
              </div>
            );
          })()}


          <DialogFooter>
            {readOnly ? (
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Voltar
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-gradient-brand text-brand-foreground hover:opacity-95"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Salvando...
                    </>
                  ) : (
                    "Salvar"
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting?.is_global ? "Excluir fornecedor global?" : "Excluir fornecedor?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.is_global
                ? "Este fornecedor é global e será removido de todas as empresas. Deseja continuar?"
                : "Esta ação não pode ser desfeita. Os produtos vinculados continuarão existindo, mas ficarão sem fornecedor selecionado."}
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

      {catalogFor && (() => {
        // Map slug de fornecedor → chave canônica usada na tela de Produtos.
        const SLUG_TO_PRODUCT_CATEGORY: Record<string, string> = {
          foam: "Foam",
          paspatur: "Paspatur",
          impressao: "Impressão",
          perfil: "Perfil",
          vidro: "Vidro",
          colagem: "Colagem",
          diversos: "produtos_diversos",
        };
        const slugs = (catalogFor.categories ?? []).filter((k) => SLUG_TO_PRODUCT_CATEGORY[k]);
        const wizardCategories = slugs.map((slug) => {
          const key = SLUG_TO_PRODUCT_CATEGORY[slug];
          const label = SUPPLIER_CATEGORIES.find((c) => c.key === slug)?.label ?? key;
          return { key, label };
        });
        return (
          <ProductImportWizard
            open={!!catalogFor}
            onOpenChange={(o: boolean) => !o && setCatalogFor(null)}
            categories={wizardCategories}
            defaultCategory={wizardCategories[0]?.key ?? "Paspatur"}
            onImported={() => {
              invalidateAllCatalog();
            }}
            mode="global-catalog"
            globalContext={{
              supplierId: catalogFor.id,
              supplierName:
                catalogFor.trade_name || catalogFor.legal_name || "Fornecedor global",
            }}
          />
        );
      })()}

    </AppShell>

  );
}
