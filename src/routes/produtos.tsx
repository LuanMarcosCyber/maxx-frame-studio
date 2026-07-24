import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { SupplierConfigWizard, type WizardRow } from "@/components/produtos/SupplierConfigWizard";
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
import { Search, Plus, Pencil, Trash2, Upload, TrendingUp, Globe2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProductImportWizard } from "@/components/produtos/ProductImportWizard";
import { PriceIncreaseWizard } from "@/components/produtos/PriceIncreaseWizard";
import {
  SupplierPicker,
  productCategoryToSupplierCategory,
  supplierLabel,
} from "@/components/suppliers/SupplierPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOperator } from "@/hooks/useOperator";
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
  source: "company" | "global";
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
  has_override?: boolean;
  base_price?: number;
  stock_quantity?: number;
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
  stock_quantity: string;
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
  stock_quantity: "0",
};


function buildPageList(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}



function Produtos() {
  const { session, user, role, profile, ownerUserId } = useAuth();
  const { requirePin } = useOperator();
  const queryClient = useQueryClient();
  const bulkDeleteProductsByCategoryFn = useServerFn(bulkDeleteProductsByCategory);
  const deleteProductByIdFn = useServerFn(deleteProductById);

  const isColaborador = role === "colaborador";
  const canEdit = role === "admin" || role === "revendedor" || (isColaborador && !!profile?.can_create_products);
  const showInternal = !isColaborador;
  const showCommission = role === "admin" || role === "revendedor";

  const [activeCategory, setActiveCategory] = useState<Category>("Foam");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [priceIncreaseOpen, setPriceIncreaseOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardAutoOpened, setWizardAutoOpened] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restorePreview, setRestorePreview] = useState<{
    particular_products: number;
    commercial_configs: number;
    global_products: number;
  } | null>(null);

  // Debounce da busca e reset de página ao alterar filtros/categoria.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    setPage(1);
  }, [activeCategory]);

  // Ensure auto-distributed products exist and detect missing supplier config.
  const { data: wizardPending = [] } = useQuery({
    queryKey: ["supplier-wizard-state"],
    enabled: !!session && canEdit,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_supplier_wizard_state");
      if (error) throw error;
      return ((data ?? []) as WizardRow[]).filter((r) => !r.configured && r.product_count > 0);

    },
  });

  // Auto-open only the first time pending config is detected in this session.
  useEffect(() => {
    if (!wizardAutoOpened && wizardPending.length > 0) {
      setWizardOpen(true);
      setWizardAutoOpened(true);
    }
  }, [wizardPending.length, wizardAutoOpened]);

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

  const { data: allProducts = [], isLoading, isFetching } = useQuery({
    queryKey: ["products"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_visible_products");
      if (error) throw error;
      const arr = (data ?? []) as Array<Record<string, unknown>>;
      return arr.map((r) => ({
        id: r.id as string,
        source: (r.source as "company" | "global") ?? "company",
        code: (r.code as string) ?? "",
        description: (r.description as string) ?? "",
        category: (r.category as string | null) ?? null,
        value_per_meter: Number(r.effective_price ?? 0),
        base_price: Number(r.base_price ?? 0),
        profit_margin: Number(r.profit_margin ?? 0),
        waste_percentage: Number(r.waste_percentage ?? 0),
        frame_width_cm: r.width_cm == null ? null : Number(r.width_cm),
        name: (r.name as string | null) ?? null,
        barcode: (r.barcode as string | null) ?? null,
        supplier: (r.supplier as string | null) ?? null,
        supplier_id: (r.supplier_id as string | null) ?? null,
        labor_cost: r.labor_cost == null ? null : Number(r.labor_cost),
        commission_percentage:
          r.commission_percentage == null ? null : Number(r.commission_percentage),
        ncm: (r.ncm as string | null) ?? null,
        has_override: Boolean(r.has_override),
      })) as Product[];
    },
  });

  // Supplementary: fetch stock_quantity for Produtos Diversos of the active company
  const { data: stockMap } = useQuery({
    queryKey: ["products", "stock", ownerUserId],
    enabled: !!session && !!ownerUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, stock_quantity")
        .eq("category", "produtos_diversos");
      if (error) throw error;
      const m = new Map<string, number>();
      ((data ?? []) as Array<{ id: string; stock_quantity: number | null }>).forEach((r) =>
        m.set(r.id, Number(r.stock_quantity ?? 0)),
      );
      return m;
    },
  });


  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const rows = allProducts
      .filter((p) => (p.category ?? "") === activeCategory)
      .map((p) =>
        p.category === "produtos_diversos" && stockMap
          ? { ...p, stock_quantity: stockMap.get(p.id) ?? 0 }
          : p,
      )
      .filter((p) => {
        if (!q) return true;
        return (
          (p.code ?? "").toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q) ||
          (p.name ?? "").toLowerCase().includes(q) ||
          (p.supplier ?? "").toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q)
        );
      });
    return rows.sort((a, b) => naturalCompare(a.code ?? "", b.code ?? ""));
  }, [allProducts, activeCategory, debouncedSearch, stockMap]);


  const totalCount = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const pageStart = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * PAGE_SIZE, totalCount);


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
      stock_quantity: String(p.stock_quantity ?? 0),
    });


    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;

    // Produto do catálogo global: apenas personaliza valores comerciais da empresa
    if (editing && editing.source === "global") {
      const newErrors: Partial<Record<keyof FormState, string>> = {};
      const value = parseNum(form.value_per_meter || "0");
      const margin = parseNum(form.profit_margin || "0");
      const waste = parseNum(form.waste_percentage || "0");
      if (Number.isNaN(value) || value < 0) newErrors.value_per_meter = "Valor inválido.";
      if (Number.isNaN(margin) || margin < 0) newErrors.profit_margin = "Margem inválida.";
      if (Number.isNaN(waste) || waste < 0) newErrors.waste_percentage = "Perda inválida.";
      const commission = form.commission_percentage.trim() === "" ? 0 : parseNum(form.commission_percentage);
      if (form.commission_percentage.trim() !== "" && (Number.isNaN(commission) || commission < 0)) {
        newErrors.commission_percentage = "Comissão inválida.";
      }
      let laborCost: number | null = null;
      if (activeCategory === "Perfil" && form.labor_cost.trim() !== "") {
        const lc = parseNum(form.labor_cost);
        if (Number.isNaN(lc) || lc < 0) newErrors.labor_cost = "Mão de obra inválida.";
        else laborCost = lc;
      }
      if (Object.keys(newErrors).length) {
        setErrors(newErrors);
        toast.error("Preencha os campos obrigatórios.");
        return;
      }
      setSaving(true);
      try {
        const { error } = await supabase.rpc("upsert_company_product_override", {
          _global_product_id: editing.id,
          _margin: margin,
          _loss: waste,
          _commission: commission,
          _labor_cost: laborCost as unknown as number,
          _base_price_override: (value === Number(editing.base_price ?? 0) ? null : value) as unknown as number,
        });
        if (error) throw error;
        toast.success("Personalização salva para esta empresa.");
        setDialogOpen(false);
        setEditing(null);
        setForm(emptyForm);
        setErrors({});
        queryClient.invalidateQueries({ queryKey: ["products"] });
      } catch (e: any) {
        toast.error(e.message ?? "Erro ao salvar personalização.");
      } finally {
        setSaving(false);
      }
      return;
    }

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
      const stockRaw = (form.stock_quantity ?? "").trim();
      const stock = stockRaw === "" ? 0 : Number(stockRaw.replace(/[^\d-]/g, ""));
      if (!Number.isFinite(stock) || !Number.isInteger(stock) || stock < 0) {
        setErrors((prev) => ({ ...prev, stock_quantity: "Estoque inválido." }));
        toast.error("Estoque atual deve ser um número inteiro maior ou igual a zero.");
        return;
      }
      setSaving(true);
      try {
        const payload = {
          code: form.code.trim().toUpperCase(),
          description: form.description.trim().toUpperCase(),
          category: "produtos_diversos",
          value_per_meter: value,
          profit_margin: 0,
          waste_percentage: 0,
          frame_width_cm: null,
          name: form.name.trim(),
          barcode: form.barcode.trim() || null,
          supplier: form.supplier.trim(),
          supplier_id: form.supplier_id,
          commission_percentage: commission,
          ncm: form.ncm.trim() || null,
          stock_quantity: stock,
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
    req("value_per_meter", activeCategory === "Perfil" ? "Informe o custo do metro linear." : "Informe o custo do metro².");
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
            code: form.code.trim().toUpperCase(),
            description: form.description.trim().toUpperCase(),
            category: activeCategory,
            value_per_meter: value,
            profit_margin: margin,
            waste_percentage: waste,
            frame_width_cm: isPerfil ? frameWidth : null,
            labor_cost: isPerfil ? laborCost : 0,
            supplier: form.supplier.trim(),
            supplier_id: form.supplier_id,
            commission_percentage: commission,
            ncm: form.ncm.trim() || null,

          })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Produto atualizado.");
      } else {
        const { error } = await supabase.from("products").insert({
          user_id: user.id,
          code: form.code.trim().toUpperCase(),
          description: form.description.trim().toUpperCase(),
          category: activeCategory,
          value_per_meter: value,
          profit_margin: margin,
          waste_percentage: waste,
          frame_width_cm: isPerfil ? frameWidth : null,
          labor_cost: isPerfil ? laborCost : 0,
          supplier: form.supplier.trim(),
          supplier_id: form.supplier_id,
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
    if (deleteTarget.source === "global") {
      toast.error("Produtos do catálogo global não podem ser excluídos.");
      setDeleteTarget(null);
      return;
    }
    const target = deleteTarget;
    const previous = queryClient.getQueryData<Product[]>(["products"]);
    // Optimistic: remove immediately from cache.
    queryClient.setQueryData<Product[]>(["products"], (current = []) =>
      current.filter((p) => p.id !== target.id),
    );
    setDeleteTarget(null);
    try {
      await deleteProductByIdFn({ data: { id: target.id } });
      toast.success("Produto excluído.");
      // Background refresh — do not block UI.
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (e: any) {
      // Rollback on failure.
      if (previous) queryClient.setQueryData(["products"], previous);
      toast.error(e.message ?? "Erro ao excluir produto.");
    }
  };




  const handleResetOverride = async (p: Product) => {
    try {
      const { error } = await supabase.rpc("reset_company_product_override", {
        _global_product_id: p.id,
      });
      if (error) throw error;
      toast.success("Produto voltou a usar a configuração padrão.");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao restaurar padrão.");
    }
  };



  const handleBulkDelete = async () => {
    if (!user) return;
    const okPin = await requirePin("excluir todos os produtos da categoria");
    if (!okPin) return;
    const previous = queryClient.getQueryData<Product[]>(["products"]);
    // Optimistic remove of all rows in this category.
    queryClient.setQueryData<Product[]>(["products"], (current = []) =>
      current.filter((product) => product.category !== activeCategory),
    );
    setBulkDeleting(true);
    setBulkDeleteOpen(false);
    try {
      const result = await bulkDeleteProductsByCategoryFn({ data: { category: activeCategory } });
      if (result.found === 0) {
        if (previous) queryClient.setQueryData(["products"], previous);
        toast.info("Nenhum produto para excluir nesta categoria.");
        return;
      }
      toast.success("Todos os produtos da categoria foram excluídos com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (e: any) {
      if (previous) queryClient.setQueryData(["products"], previous);
      toast.error(e.message ?? "Erro ao excluir produtos.");
    } finally {
      setBulkDeleting(false);
    }
  };


  return (
    <AppShell title="Produtos" subtitle="Gerencie produtos por categoria">
      {canEdit && wizardPending.length > 0 && !wizardOpen && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex-1 text-sm text-amber-900 dark:text-amber-100 space-y-0.5">
            {wizardPending.map((p) => {
              const fields =
                p.category === "Perfil"
                  ? "margem, perda, comissão e mão de obra"
                  : "margem, perda e comissão";
              return (
                <div key={p.supplier_id}>
                  <b>Configuração pendente:</b> defina {fields} dos {p.category.toLowerCase()}s da {p.supplier_name}.
                </div>
              );
            })}
          </div>
          <Button
            size="sm"
            className="w-full sm:w-auto shrink-0"
            onClick={() => setWizardOpen(true)}
          >
            Configurar agora
          </Button>
        </div>
      )}
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
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button
                variant="outline"
                onClick={() => setPriceIncreaseOpen(true)}
              >
                <TrendingUp className="h-4 w-4 mr-1.5" /> Alteração em Massa
              </Button>
              <Button
                variant="outline"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="h-4 w-4 mr-1.5" /> Importar Produtos
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  setRestoreConfirm("");
                  setRestorePreview(null);
                  setRestoreOpen(true);
                  const { data, error } = await supabase.rpc("preview_restore_default_catalog");
                  if (error) {
                    toast.error(error.message);
                    return;
                  }
                  const row = Array.isArray(data) ? data[0] : data;
                  if (row) setRestorePreview(row as any);
                }}
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <RotateCcw className="h-4 w-4 mr-1.5" /> Restaurar catálogo padrão
              </Button>
            </div>
          )}
        </div>
      </Card>



      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold">{activeLabel}</h2>
            <p className="text-xs text-muted-foreground">
              {totalCount} produto{totalCount === 1 ? "" : "s"}
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
                {totalCount > 0 && (
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
                    <th className="font-medium py-3 px-3">Estoque</th>
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
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    Nenhum produto em {activeLabel}.
                  </td>
                </tr>
              ) : (
                pageRows.map((p) =>
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
                      <td className="py-3.5 px-3">
                        {(() => {
                          const s = Number(p.stock_quantity ?? 0);
                          const cls =
                            s <= 0
                              ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                              : s <= 5
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
                          const label = s <= 0 ? "Sem estoque" : s <= 5 ? `${s} • baixo` : `${s}`;
                          return (
                            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>
                              {label}
                            </span>
                          );
                        })()}
                      </td>
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
                      <td className="py-3.5 px-6 align-top">
                        <div className="flex flex-col gap-1 min-w-[180px]">
                          <span className="font-mono font-semibold">{p.code}</span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {p.source === "global" && (
                              <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                                <Globe2 className="h-3 w-3" /> Global
                              </Badge>
                            )}
                            {p.has_override && (
                              <Badge variant="outline" className="text-[10px] h-5">
                                Personalizado
                              </Badge>
                            )}
                          </div>
                          {p.source === "global" && p.supplier && (
                            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-normal break-words leading-snug">
                              <span className="text-muted-foreground font-normal">FORNECEDOR: </span>
                              {p.supplier}
                            </div>
                          )}
                        </div>
                      </td>
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
                              aria-label={p.source === "global" ? "Personalizar produto" : "Editar produto"}
                              title={p.source === "global" ? "Personalizar valores para esta empresa" : "Editar produto"}
                            >
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </button>
                            {p.source === "global" && p.has_override && (
                              <button
                                onClick={() => handleResetOverride(p)}
                                className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent transition"
                                aria-label="Voltar ao padrão"
                                title="Voltar a usar a configuração padrão"
                              >
                                <RotateCcw className="h-4 w-4 text-muted-foreground" />
                              </button>
                            )}
                            {p.source !== "global" && (
                              <button
                                onClick={() => setDeleteTarget(p)}
                                className="h-8 w-8 grid place-items-center rounded-md hover:bg-destructive/10 transition"
                                aria-label="Excluir produto"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </button>
                            )}
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

        {totalCount > 0 && (
          <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Exibindo {pageStart}–{pageEnd} de {totalCount} produto{totalCount === 1 ? "" : "s"}
              {isFetching && !isLoading ? " • atualizando..." : ""}
            </p>
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                {buildPageList(currentPage, totalPages).map((it, idx) =>
                  it === "…" ? (
                    <span key={`e-${idx}`} className="px-2 text-muted-foreground text-sm">…</span>
                  ) : (
                    <Button
                      key={it}
                      variant={it === currentPage ? "default" : "outline"}
                      size="sm"
                      className="min-w-[36px]"
                      onClick={() => setPage(it as number)}
                    >
                      {it}
                    </Button>
                  ),
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Próxima
                </Button>
              </div>
            )}

          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.source === "global"
                ? "Personalizar produto global"
                : editing
                  ? "Editar produto"
                  : "Cadastrar produto"} — {activeLabel}
            </DialogTitle>
          </DialogHeader>
          {editing?.source === "global" && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2.5 text-xs text-amber-900 dark:text-amber-100">
              <b>Catálogo global:</b> código, descrição, fornecedor, NCM e largura vêm do fornecedor global e não podem ser alterados aqui.
              Você pode ajustar somente os valores comerciais desta empresa.
            </div>
          )}


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
                    onChange={(e) => updateField("code", e.target.value.toUpperCase())}
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
                <SupplierPicker
                  value={form.supplier_id}
                  legacyText={form.supplier}
                  preferredCategory={productCategoryToSupplierCategory("produtos_diversos")}
                  onChange={(id, opt) =>
                    setForm((f) => ({
                      ...f,
                      supplier_id: id,
                      supplier: opt ? supplierLabel(opt).toUpperCase() : f.supplier,
                    }))
                  }
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="d-ncm">NCM</Label>
                  <Input
                    id="d-ncm"
                    placeholder="Opcional"
                    value={form.ncm}
                    onChange={(e) => updateField("ncm", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="d-stock">Estoque atual *</Label>
                  <Input
                    id="d-stock"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    placeholder="0"
                    value={form.stock_quantity}
                    onChange={(e) =>
                      updateField("stock_quantity", e.target.value.replace(/[^\d]/g, ""))
                    }
                    className={errCls("stock_quantity")}
                  />
                  <FieldError field="stock_quantity" />
                  <p className="text-[11px] text-muted-foreground">
                    Quantidade em estoque. Será descontada ao aprovar orçamentos.
                  </p>
                </div>
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
                    onChange={(e) => updateField("code", e.target.value.toUpperCase())}
                    className={errCls("code")}
                    disabled={editing?.source === "global"}
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
                    disabled={editing?.source === "global"}
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
                  disabled={editing?.source === "global"}
                />
                <FieldError field="description" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="forn">Fornecedor / Fabricante *</Label>
                {editing?.source === "global" ? (
                  <Input value={form.supplier} disabled readOnly />
                ) : (
                  <>
                    <SupplierPicker
                      value={form.supplier_id}
                      legacyText={form.supplier}
                      preferredCategory={productCategoryToSupplierCategory(activeCategory)}
                      onChange={(id, opt) =>
                        setForm((f) => ({
                          ...f,
                          supplier_id: id,
                          supplier: opt ? supplierLabel(opt).toUpperCase() : f.supplier,
                        }))
                      }
                      className={errCls("supplier")}
                    />
                    <FieldError field="supplier" />
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="val">
                    {activeCategory === "Perfil" ? "Custo do metro linear (R$)" : "Custo do metro² (R$)"} *
                  </Label>
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
                      disabled={editing?.source === "global"}
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

      <PriceIncreaseWizard
        open={priceIncreaseOpen}
        onOpenChange={setPriceIncreaseOpen}
        initialCategory={activeCategory}
      />

      <SupplierConfigWizard
        open={wizardOpen && wizardPending.length > 0}
        onOpenChange={setWizardOpen}
        pending={wizardPending}
        ownerUserId={ownerUserId}
      />

      <AlertDialog
        open={restoreOpen}
        onOpenChange={(o) => {
          if (restoring) return;
          setRestoreOpen(o);
          if (!o) {
            setRestoreConfirm("");
            setRestorePreview(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar catálogo padrão?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Esta ação excluirá permanentemente todos os produtos cadastrados
                  exclusivamente por esta empresa e removerá todas as configurações
                  comerciais aplicadas aos produtos globais.
                </p>
                <p>
                  Após a restauração, permanecerão apenas os produtos do catálogo
                  global, com margem, perda, comissão e mão de obra pendentes de nova
                  configuração.
                </p>
                <p className="text-muted-foreground">
                  Pedidos e orçamentos antigos não serão alterados.
                </p>
                <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span>Produtos particulares que serão excluídos:</span>
                    <b>{restorePreview?.particular_products ?? "…"}</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Configurações comerciais que serão removidas:</span>
                    <b>{restorePreview?.commercial_configs ?? "…"}</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Produtos globais que permanecerão:</span>
                    <b>{restorePreview?.global_products ?? "…"}</b>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="restore-confirm" className="text-xs">
                    Para confirmar, digite <b>RESTAURAR</b>:
                  </Label>
                  <Input
                    id="restore-confirm"
                    autoFocus
                    value={restoreConfirm}
                    onChange={(e) => setRestoreConfirm(e.target.value)}
                    placeholder="RESTAURAR"
                    disabled={restoring}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoring || restoreConfirm.trim().toUpperCase() !== "RESTAURAR"}
              onClick={async (e) => {
                e.preventDefault();
                const okPin = await requirePin("restaurar catálogo padrão");
                if (!okPin) return;
                setRestoring(true);
                const toastId = toast.loading("Restaurando catálogo padrão...");
                try {
                  const { error } = await supabase.rpc("restore_default_catalog");
                  if (error) throw error;
                  toast.success("Catálogo padrão restaurado com sucesso.", {
                    id: toastId,
                    description:
                      "Os produtos particulares foram removidos e os produtos globais estão prontos para uma nova configuração comercial.",
                  });
                  setRestoreOpen(false);
                  setRestoreConfirm("");
                  setRestorePreview(null);
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["products"] }),
                    queryClient.invalidateQueries({ queryKey: ["supplier-wizard-state"] }),
                  ]);
                  setWizardAutoOpened(false);
                  setWizardOpen(true);
                } catch (err: any) {
                  toast.error(err?.message ?? "Erro ao restaurar catálogo.", { id: toastId });
                } finally {
                  setRestoring(false);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {restoring ? "Restaurando..." : "Restaurar catálogo padrão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
