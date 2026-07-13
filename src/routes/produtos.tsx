import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
import { Search, Plus, Pencil, Trash2, Upload } from "lucide-react";
import { ProductImportWizard } from "@/components/produtos/ProductImportWizard";
import {
  SupplierPicker,
  productCategoryToSupplierCategory,
  supplierLabel,
} from "@/components/suppliers/SupplierPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn, naturalCompare } from "@/lib/utils";
import { bulkDeleteProductsByCategory, deleteProductById } from "@/lib/products.functions";

export const Route = createFileRoute("/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos — Total Maxx ERP" },
      { name: "description", content: "Catálogo de produtos do Total Maxx ERP: foam, paspatur, impressão, perfil, vidro, colagem e produtos diversos." },
      { property: "og:title", content: "Produtos — Total Maxx ERP" },
      { property: "og:description", content: "Catálogo de produtos por categoria no Total Maxx ERP." },
      { property: "og:url", content: "https://maxx-frame-studio.lovable.app/produtos" },
    ],
    links: [{ rel: "canonical", href: "https://maxx-frame-studio.lovable.app/produtos" }],
  }),
  component: Produtos,
});

const CATEGORIES = [
  { key: "Foam", label: "Foam" },
  { key: "Paspatur", label: "Paspatur" },
  { key: "Impressão", label: "Impressão" },
  { key: "Perfil", label: "Perfil" },
  { key: "Vidro", label: "Vidro" },
  { key: "Colagem", label: "Colagem" },
  { key: "produtos_diversos", label: "Produtos Diversos" },
] as const;
type Category = (typeof CATEGORIES)[number]["key"];

const fmtMoney = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (n: number) => `${Number(n).toLocaleString("pt-BR")}%`;

const parseNum = (s: string) => {
  const cleaned = s.replace(/\./g, "").replace(",", ".").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
};

type Product = {
  id: string;
  code: string;
  description: string;
  category: string | null;
  value_per_meter: number;
  profit_margin: number;
  waste_percentage: number;
  frame_width_cm: number | null;
  name: string | null;
  barcode: string | null;
  supplier: string | null;
  supplier_id: string | null;
  labor_cost: number | null;
  commission_percentage: number | null;
  ncm: string | null;
};

type FormState = {
  code: string;
  description: string;
  value_per_meter: string;
  profit_margin: string;
  waste_percentage: string;
  frame_width_cm: string;
  name: string;
  barcode: string;
  supplier: string;
  supplier_id: string | null;
  labor_cost: string;
  commission_percentage: string;
  ncm: string;
};

const emptyForm: FormState = {
  code: "",
  description: "",
  value_per_meter: "",
  profit_margin: "",
  waste_percentage: "",
  frame_width_cm: "",
  name: "",
  barcode: "",
  supplier: "",
  supplier_id: null,
  labor_cost: "",
  commission_percentage: "",
  ncm: "",
};


function Produtos() {
  const { session, user, role, profile } = useAuth();
  const queryClient = useQueryClient();
  const bulkDeleteProductsByCategoryFn = useServerFn(bulkDeleteProductsByCategory);
  const deleteProductByIdFn = useServerFn(deleteProductById);

  const isColaborador = role === "colaborador";
  const canEdit = role === "admin" || role === "revendedor" || (isColaborador && !!profile?.can_create_products);
  const showInternal = !isColaborador;
  const showCommission = role === "admin" || role === "revendedor";

  const [activeCategory, setActiveCategory] = useState<Category>("Foam");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const updateField = (field: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  };
  const errCls = (field: keyof FormState) =>
    errors[field] ? "border-destructive focus-visible:ring-destructive" : "";
  const FieldError = ({ field }: { field: keyof FormState }) =>
    errors[field] ? (
      <p className="text-xs text-destructive">{errors[field]}</p>
    ) : null;

  const isDiversos = activeCategory === "produtos_diversos";
  const baseLabel =
    CATEGORIES.find((c) => c.key === activeCategory)?.label ?? activeCategory;
  const activeLabel =
    activeCategory === "Paspatur" ? "Paspatur / Sanduíche de Vidro" : baseLabel;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["products"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, code, description, category, value_per_meter, profit_margin, waste_percentage, frame_width_cm, name, barcode, supplier, supplier_id, labor_cost, commission_percentage, ncm",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (r.category ?? "") === activeCategory)
      .filter(
        (r) =>
          !q ||
          r.code.toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q) ||
          (r.name ?? "").toLowerCase().includes(q) ||
          (r.supplier ?? "").toLowerCase().includes(q) ||
          (r.barcode ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => naturalCompare(a.code, b.code));
  }, [rows, activeCategory, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      labor_cost: activeCategory === "Perfil" ? "15,00" : "",
    });
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setErrors({});
    setForm({
      code: p.code,
      description: p.description ?? "",
      value_per_meter: String(p.value_per_meter).replace(".", ","),
      profit_margin: String(p.profit_margin).replace(".", ","),
      waste_percentage: String(p.waste_percentage).replace(".", ","),
      frame_width_cm:
        p.frame_width_cm == null
          ? ""
          : String(p.frame_width_cm).replace(".", ","),
      name: p.name ?? "",
      barcode: p.barcode ?? "",
      supplier: p.supplier ?? "",
      supplier_id: p.supplier_id ?? null,
      labor_cost:
        p.labor_cost == null || Number(p.labor_cost) === 0
          ? ""
          : String(p.labor_cost).replace(".", ","),
      commission_percentage:
        p.commission_percentage == null || Number(p.commission_percentage) === 0
          ? ""
          : String(p.commission_percentage).replace(".", ","),
      ncm: p.ncm ?? "",
    });

    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    const newErrors: Partial<Record<keyof FormState, string>> = {};
    const req = (field: keyof FormState, msg = "Campo obrigatório") => {
      const v = form[field];
      if (typeof v !== "string" || !v.trim()) newErrors[field] = msg;
    };

    if (isDiversos) {
      req("code", "Informe o código interno.");
      req("name", "Informe o nome.");
      req("description", "Informe a descrição.");
      req("supplier", "Informe o fornecedor / fabricante.");
      req("value_per_meter", "Informe o valor.");
      const value = parseNum(form.value_per_meter || "0");
      if (!newErrors.value_per_meter && Number.isNaN(value)) {
        newErrors.value_per_meter = "Valor inválido.";
      }
      const commission = form.commission_percentage.trim() === "" ? 0 : parseNum(form.commission_percentage);
      if (form.commission_percentage.trim() !== "" && Number.isNaN(commission)) {
        newErrors.commission_percentage = "Comissão inválida.";
      }
      if (Object.keys(newErrors).length) {
        setErrors(newErrors);
        toast.error("Preencha os campos obrigatórios.");
        return;
      }
      setSaving(true);
      try {
        const payload = {
          code: form.code.trim(),
          description: form.description.trim(),
          category: "produtos_diversos",
          value_per_meter: value,
          profit_margin: 0,
          waste_percentage: 0,
          frame_width_cm: null,
          name: form.name.trim(),
          barcode: form.barcode.trim() || null,
          supplier: form.supplier.trim(),
          commission_percentage: commission,
          ncm: form.ncm.trim() || null,
        };

        if (editing) {
          const { error } = await supabase
            .from("products")
            .update(payload)
            .eq("id", editing.id);
          if (error) throw error;
          toast.success("Produto atualizado.");
        } else {
          const { error } = await supabase
            .from("products")
            .insert({ ...payload, user_id: user.id });
          if (error) throw error;
          toast.success("Produto cadastrado.");
        }
        setDialogOpen(false);
        setEditing(null);
        setForm(emptyForm);
        setErrors({});
        queryClient.invalidateQueries({ queryKey: ["products"] });
      } catch (e: any) {
        toast.error(e.message ?? "Erro ao salvar produto.");
      } finally {
        setSaving(false);
      }
      return;
    }

    req("code", "Informe o código.");
    req("description", "Informe a descrição.");
    req("supplier", "Informe o fornecedor / fabricante.");
    req("value_per_meter", "Informe o valor do metro.");
    req("profit_margin", "Informe a margem.");
    req("waste_percentage", "Informe a perda.");
    const value = parseNum(form.value_per_meter || "0");
    const margin = parseNum(form.profit_margin || "0");
    const waste = parseNum(form.waste_percentage || "0");
    if (!newErrors.value_per_meter && Number.isNaN(value)) newErrors.value_per_meter = "Valor inválido.";
    if (!newErrors.profit_margin && Number.isNaN(margin)) newErrors.profit_margin = "Margem inválida.";
    if (!newErrors.waste_percentage && Number.isNaN(waste)) newErrors.waste_percentage = "Perda inválida.";

    const isPerfil = activeCategory === "Perfil";
    let frameWidth: number | null = null;
    if (isPerfil) {
      if (form.frame_width_cm.trim() === "") {
        newErrors.frame_width_cm = "Informe a largura da moldura.";
      } else {
        const fw = parseNum(form.frame_width_cm);
        if (Number.isNaN(fw)) {
          newErrors.frame_width_cm = "Largura da moldura inválida.";
        } else {
          frameWidth = fw;
        }
      }
    }

    const commission = form.commission_percentage.trim() === "" ? 0 : parseNum(form.commission_percentage);
    if (form.commission_percentage.trim() !== "" && Number.isNaN(commission)) {
      newErrors.commission_percentage = "Comissão inválida.";
    }
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      toast.error("Preencha os campos obrigatórios.");
      return;
    }
    let laborCost = 0;
    if (isPerfil && form.labor_cost.trim() !== "") {
      const lc = parseNum(form.labor_cost);
      if (Number.isNaN(lc)) {
        setErrors({ labor_cost: "Mão de obra inválida." });
        toast.error("Mão de obra inválida.");
        return;
      }
      laborCost = lc;
    }

    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("products")
          .update({
            code: form.code.trim(),
            description: form.description.trim(),
            category: activeCategory,
            value_per_meter: value,
            profit_margin: margin,
            waste_percentage: waste,
            frame_width_cm: isPerfil ? frameWidth : null,
            labor_cost: isPerfil ? laborCost : 0,
            supplier: form.supplier.trim(),
            commission_percentage: commission,
            ncm: form.ncm.trim() || null,

          })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Produto atualizado.");
      } else {
        const { error } = await supabase.from("products").insert({
          user_id: user.id,
          code: form.code.trim(),
          description: form.description.trim(),
          category: activeCategory,
          value_per_meter: value,
          profit_margin: margin,
          waste_percentage: waste,
          frame_width_cm: isPerfil ? frameWidth : null,
          labor_cost: isPerfil ? laborCost : 0,
          supplier: form.supplier.trim(),
          commission_percentage: commission,
          ncm: form.ncm.trim() || null,

        });
        if (error) throw error;
        toast.success("Produto cadastrado.");
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setErrors({});
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar produto.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProductByIdFn({ data: { id: deleteTarget.id } });
      queryClient.setQueryData<Product[]>(["products"], (current = []) =>
        current.filter((p) => p.id !== deleteTarget.id),
      );
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Produto excluído.");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao excluir produto.");
    } finally {
      setDeleteTarget(null);
    }
  };


  const handleBulkDelete = async () => {
    if (!user) return;
    setBulkDeleting(true);
    try {
      const result = await bulkDeleteProductsByCategoryFn({ data: { category: activeCategory } });
      if (result.found === 0) {
        toast.info("Nenhum produto para excluir nesta categoria.");
        return;
      }

      queryClient.setQueryData<Product[]>(["products"], (current = []) =>
        current.filter((product) => product.category !== activeCategory),
      );
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Todos os produtos da categoria foram excluídos com sucesso.");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao excluir produtos.");
    } finally {
      setBulkDeleting(false);
      setBulkDeleteOpen(false);
    }
  };


  return (
    <AppShell title="Produtos" subtitle="Gerencie produtos por categoria">
      <Card className="p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setActiveCategory(c.key)}
                className={cn(
                  "px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                  activeCategory === c.key
                    ? "bg-gradient-brand text-brand-foreground border-transparent shadow-brand"
                    : "bg-background text-foreground border-border hover:bg-accent",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          {canEdit && (
            <Button
              variant="outline"
              onClick={() => setImportOpen(true)}
              className="sm:ml-auto"
            >
              <Upload className="h-4 w-4 mr-1.5" /> Importar Produtos
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold">{activeLabel}</h2>
            <p className="text-xs text-muted-foreground">
              {filtered.length} produto{filtered.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={`Buscar em ${activeLabel}...`}
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {canEdit && (
              <>
                <Button
                  onClick={openCreate}
                  className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
                >
                  <Plus className="h-4 w-4 mr-1.5" /> Novo Produto
                </Button>
                {filtered.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBulkDeleteOpen(true)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" /> Excluir todos
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border">
                {isDiversos ? (
                  <>
                    <th className="font-medium py-3 px-6">Cód. Interno</th>
                    <th className="font-medium py-3 px-3">Nome</th>
                    <th className="font-medium py-3 px-3">Fornecedor</th>
                    {showInternal && (
                      <th className="font-medium py-3 px-3">Valor</th>
                    )}
                    {showCommission && <th className="font-medium py-3 px-3">Comissão</th>}
                    <th className="font-medium py-3 px-3">Descrição</th>
                    {canEdit && (
                      <th className="font-medium py-3 px-6 text-right">Ações</th>
                    )}
                  </>
                ) : (
                  <>
                    <th className="font-medium py-3 px-6">Código</th>
                    <th className="font-medium py-3 px-3">Descrição</th>
                    <th className="font-medium py-3 px-3">NCM</th>
                    {activeCategory === "Perfil" && (
                      <th className="font-medium py-3 px-3">Largura</th>
                    )}
                    {showInternal && <th className="font-medium py-3 px-3">Valor/m</th>}
                    {showInternal && <th className="font-medium py-3 px-3">Margem</th>}
                    {showInternal && <th className="font-medium py-3 px-3">Perda</th>}
                    {showCommission && <th className="font-medium py-3 px-3">Comissão</th>}
                    {canEdit && (
                      <th className="font-medium py-3 px-6 text-right">Ações</th>
                    )}
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    Nenhum produto em {activeLabel}.
                  </td>
                </tr>
              ) : (
                filtered.map((p) =>
                  isDiversos ? (
                    <tr key={p.id} className="hover:bg-muted/40 transition">
                      <td className="py-3.5 px-6 font-mono font-semibold">{p.code}</td>
                      <td className="py-3.5 px-3">{p.name ?? "—"}</td>
                      <td className="py-3.5 px-3 text-muted-foreground">
                        {p.supplier ?? "—"}
                      </td>
                      {showInternal && (
                        <td className="py-3.5 px-3 font-semibold">
                          {fmtMoney(Number(p.value_per_meter))}
                        </td>
                      )}
                      {showCommission && (
                        <td className="py-3.5 px-3 text-muted-foreground">
                          {Number(p.commission_percentage ?? 0) > 0 ? fmtPct(Number(p.commission_percentage)) : "—"}
                        </td>
                      )}
                      <td className="py-3.5 px-3 text-muted-foreground max-w-xs truncate">
                        {p.description || "—"}
                      </td>
                      {canEdit && (
                        <td className="py-3.5 px-6">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(p)}
                              className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent transition"
                              aria-label="Editar produto"
                            >
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(p)}
                              className="h-8 w-8 grid place-items-center rounded-md hover:bg-destructive/10 transition"
                              aria-label="Excluir produto"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ) : (
                    <tr key={p.id} className="hover:bg-muted/40 transition">
                      <td className="py-3.5 px-6 font-mono font-semibold">{p.code}</td>
                      <td
                        className="py-3.5 px-3 max-w-[280px] truncate"
                        title={p.description}
                      >
                        {p.description}
                      </td>
                      <td className="py-3.5 px-3 text-muted-foreground font-mono text-xs">
                        {p.ncm ?? "—"}
                      </td>
                      {activeCategory === "Perfil" && (
                        <td className="py-3.5 px-3 text-muted-foreground">
                          {p.frame_width_cm == null
                            ? "—"
                            : `${Number(p.frame_width_cm).toLocaleString("pt-BR")} cm`}
                        </td>
                      )}
                      {showInternal && (
                        <td className="py-3.5 px-3 font-semibold">
                          {fmtMoney(Number(p.value_per_meter))}
                        </td>
                      )}
                      {showInternal && (
                        <td className="py-3.5 px-3 text-muted-foreground">
                          {fmtPct(Number(p.profit_margin))}
                        </td>
                      )}
                      {showInternal && (
                        <td className="py-3.5 px-3 text-muted-foreground">
                          {fmtPct(Number(p.waste_percentage))}
                        </td>
                      )}
                      {showCommission && (
                        <td className="py-3.5 px-3 text-muted-foreground">
                          {Number(p.commission_percentage ?? 0) > 0 ? fmtPct(Number(p.commission_percentage)) : "—"}
                        </td>
                      )}
                      {canEdit && (
                        <td className="py-3.5 px-6">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(p)}
                              className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent transition"
                              aria-label="Editar produto"
                            >
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(p)}
                              className="h-8 w-8 grid place-items-center rounded-md hover:bg-destructive/10 transition"
                              aria-label="Excluir produto"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar produto" : "Cadastrar produto"} — {activeLabel}
            </DialogTitle>
          </DialogHeader>

          {isDiversos ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="d-nome">Nome *</Label>
                <Input
                  id="d-nome"
                  placeholder="Nome do produto"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  className={errCls("name")}
                />
                <FieldError field="name" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="d-cod">Código Interno *</Label>
                  <Input
                    id="d-cod"
                    placeholder="Ex: DIV-001"
                    value={form.code}
                    onChange={(e) => updateField("code", e.target.value)}
                    className={errCls("code")}
                  />
                  <FieldError field="code" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="d-bar">Código de Barras</Label>
                  <Input
                    id="d-bar"
                    placeholder="Opcional"
                    value={form.barcode}
                    onChange={(e) => updateField("barcode", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-desc">Descrição *</Label>
                <Textarea
                  id="d-desc"
                  placeholder="Detalhes do produto"
                  value={form.description}
                  onChange={(e) => updateField("description", e.target.value.toUpperCase())}
                  className={errCls("description")}
                />
                <FieldError field="description" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-forn">Fornecedor / Fabricante *</Label>
                <Input
                  id="d-forn"
                  placeholder="Nome do fornecedor ou fabricante"
                  value={form.supplier}
                  onChange={(e) => updateField("supplier", e.target.value.toUpperCase())}
                  className={errCls("supplier")}
                />
                <FieldError field="supplier" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-val">Valor (R$) *</Label>
                <Input
                  id="d-val"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.value_per_meter}
                  onChange={(e) => updateField("value_per_meter", e.target.value)}
                  className={errCls("value_per_meter")}
                />
                <FieldError field="value_per_meter" />
              </div>
              {showCommission && (
                <div className="space-y-1.5">
                  <Label htmlFor="d-com">Comissão (%)</Label>
                  <Input
                    id="d-com"
                    inputMode="decimal"
                    placeholder="0 (opcional)"
                    value={form.commission_percentage}
                    onChange={(e) => updateField("commission_percentage", e.target.value)}
                    className={errCls("commission_percentage")}
                  />
                  <FieldError field="commission_percentage" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="d-ncm">NCM</Label>
                <Input
                  id="d-ncm"
                  placeholder="Opcional"
                  value={form.ncm}
                  onChange={(e) => updateField("ncm", e.target.value)}
                />
              </div>
            </div>

          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cod">Código *</Label>
                  <Input
                    id="cod"
                    placeholder="Ex: FOAM-001"
                    value={form.code}
                    onChange={(e) => updateField("code", e.target.value)}
                    className={errCls("code")}
                  />
                  <FieldError field="code" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ncm">NCM</Label>
                  <Input
                    id="ncm"
                    placeholder="Opcional"
                    value={form.ncm}
                    onChange={(e) => updateField("ncm", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="desc">Descrição *</Label>
                <Input
                  id="desc"
                  placeholder="Descrição do produto"
                  value={form.description}
                  onChange={(e) => updateField("description", e.target.value.toUpperCase())}
                  className={errCls("description")}
                />
                <FieldError field="description" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="forn">Fornecedor / Fabricante *</Label>
                <Input
                  id="forn"
                  placeholder="Nome do fornecedor ou fabricante"
                  value={form.supplier}
                  onChange={(e) => updateField("supplier", e.target.value.toUpperCase())}
                  className={errCls("supplier")}
                />
                <FieldError field="supplier" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="val">Valor do metro (R$) *</Label>
                  <Input
                    id="val"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.value_per_meter}
                    onChange={(e) => updateField("value_per_meter", e.target.value)}
                    className={errCls("value_per_meter")}
                  />
                  <FieldError field="value_per_meter" />
                </div>
                {activeCategory === "Perfil" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="fw">Largura da moldura (cm) *</Label>
                    <Input
                      id="fw"
                      inputMode="decimal"
                      placeholder="Ex: 3"
                      value={form.frame_width_cm}
                      onChange={(e) => updateField("frame_width_cm", e.target.value)}
                      className={errCls("frame_width_cm")}
                    />
                    <FieldError field="frame_width_cm" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="mar">Margem (%) *</Label>
                  <Input
                    id="mar"
                    inputMode="decimal"
                    placeholder="0"
                    value={form.profit_margin}
                    onChange={(e) => updateField("profit_margin", e.target.value)}
                    className={errCls("profit_margin")}
                  />
                  <FieldError field="profit_margin" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="per">Perda (%) *</Label>
                  <Input
                    id="per"
                    inputMode="decimal"
                    placeholder="0"
                    value={form.waste_percentage}
                    onChange={(e) => updateField("waste_percentage", e.target.value)}
                    className={errCls("waste_percentage")}
                  />
                  <FieldError field="waste_percentage" />
                </div>
              </div>
              {(activeCategory === "Perfil" || showCommission) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeCategory === "Perfil" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="lc">Mão de obra (R$)</Label>
                      <Input
                        id="lc"
                        inputMode="decimal"
                        placeholder="15,00"
                        value={form.labor_cost}
                        onChange={(e) => updateField("labor_cost", e.target.value)}
                        className={errCls("labor_cost")}
                      />
                      <FieldError field="labor_cost" />
                    </div>
                  )}
                  {showCommission && (
                    <div className="space-y-1.5">
                      <Label htmlFor="com">Comissão (%)</Label>
                      <Input
                        id="com"
                        inputMode="decimal"
                        placeholder="0 (opcional)"
                        value={form.commission_percentage}
                        onChange={(e) => updateField("commission_percentage", e.target.value)}
                        className={errCls("commission_percentage")}
                      />
                      <FieldError field="commission_percentage" />
                    </div>
                  )}
                </div>
              )}
            </div>

          )}

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

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá permanentemente “
              {deleteTarget?.name ?? deleteTarget?.description}”.
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

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir todos os produtos de {activeLabel}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir todos os produtos da categoria{" "}
              <b>{activeLabel}</b>? Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleBulkDelete();
              }}
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? "Excluindo..." : "Sim, excluir todos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProductImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        categories={CATEGORIES.map((c) => ({ key: c.key, label: c.label }))}
        defaultCategory={activeCategory}
        onImported={() => queryClient.invalidateQueries({ queryKey: ["products"] })}
      />
    </AppShell>
  );
}
