import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  labor_cost: "",
  commission_percentage: "",
  ncm: "",
};


function Produtos() {
  const { session, user, role, profile } = useAuth();
  const queryClient = useQueryClient();
  const isColaborador = role === "colaborador";
  const canEdit = role === "admin" || role === "revendedor" || (isColaborador && !!profile?.can_create_products);
  const showInternal = !isColaborador;
  const showCommission = role === "admin" || role === "revendedor";

  const [activeCategory, setActiveCategory] = useState<Category>("Foam");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

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
          "id, code, description, category, value_per_meter, profit_margin, waste_percentage, frame_width_cm, name, barcode, supplier, labor_cost, commission_percentage",
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
      );
  }, [rows, activeCategory, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
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
      labor_cost:
        p.labor_cost == null || Number(p.labor_cost) === 0
          ? ""
          : String(p.labor_cost).replace(".", ","),
      commission_percentage:
        p.commission_percentage == null || Number(p.commission_percentage) === 0
          ? ""
          : String(p.commission_percentage).replace(".", ","),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;

    if (isDiversos) {
      if (!form.name.trim() || !form.code.trim()) {
        toast.error("Preencha nome e código interno.");
        return;
      }
      const value = parseNum(form.value_per_meter || "0");
      if (Number.isNaN(value)) {
        toast.error("Valor inválido.");
        return;
      }
      setSaving(true);
      try {
        const commission = form.commission_percentage.trim() === "" ? 0 : parseNum(form.commission_percentage);
        if (Number.isNaN(commission)) {
          toast.error("Comissão inválida.");
          setSaving(false);
          return;
        }
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
          supplier: form.supplier.trim() || null,
          commission_percentage: commission,
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
        queryClient.invalidateQueries({ queryKey: ["products"] });
      } catch (e: any) {
        toast.error(e.message ?? "Erro ao salvar produto.");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!form.code.trim() || !form.description.trim()) {
      toast.error("Preencha código e descrição.");
      return;
    }
    const value = parseNum(form.value_per_meter || "0");
    const margin = parseNum(form.profit_margin || "0");
    const waste = parseNum(form.waste_percentage || "0");
    if ([value, margin, waste].some((n) => Number.isNaN(n))) {
      toast.error("Valores numéricos inválidos.");
      return;
    }
    const isPerfil = activeCategory === "Perfil";
    let frameWidth: number | null = null;
    if (isPerfil) {
      if (form.frame_width_cm.trim() === "") {
        frameWidth = null;
      } else {
        const fw = parseNum(form.frame_width_cm);
        if (Number.isNaN(fw)) {
          toast.error("Largura da moldura inválida.");
          return;
        }
        frameWidth = fw;
      }
    }

    const commission = form.commission_percentage.trim() === "" ? 0 : parseNum(form.commission_percentage);
    if (Number.isNaN(commission)) {
      toast.error("Comissão inválida.");
      return;
    }
    let laborCost = 0;
    if (isPerfil && form.labor_cost.trim() !== "") {
      const lc = parseNum(form.labor_cost);
      if (Number.isNaN(lc)) {
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
            commission_percentage: commission,
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
          commission_percentage: commission,
        });
        if (error) throw error;
        toast.success("Produto cadastrado.");
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
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
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("Produto excluído.");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao excluir produto.");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <AppShell title="Produtos" subtitle="Gerencie produtos por categoria">
      <Card className="p-4 mb-6">
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
              <Button
                onClick={openCreate}
                className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Novo Produto
              </Button>
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
                      <td className="py-3.5 px-3">{p.description}</td>
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
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="d-cod">Código Interno *</Label>
                  <Input
                    id="d-cod"
                    placeholder="Ex: DIV-001"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="d-bar">Código de Barras</Label>
                  <Input
                    id="d-bar"
                    placeholder="Opcional"
                    value={form.barcode}
                    onChange={(e) =>
                      setForm({ ...form, barcode: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="d-forn">Fornecedor</Label>
                  <Input
                    id="d-forn"
                    placeholder="Opcional"
                    value={form.supplier}
                    onChange={(e) =>
                      setForm({ ...form, supplier: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="d-val">Valor (R$) *</Label>
                  <Input
                    id="d-val"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.value_per_meter}
                    onChange={(e) =>
                      setForm({ ...form, value_per_meter: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-desc">Descrição</Label>
                <Textarea
                  id="d-desc"
                  placeholder="Detalhes do produto (opcional)"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
              {showCommission && (
                <div className="space-y-1.5">
                  <Label htmlFor="d-com">Comissão (%)</Label>
                  <Input
                    id="d-com"
                    inputMode="decimal"
                    placeholder="0"
                    value={form.commission_percentage}
                    onChange={(e) =>
                      setForm({ ...form, commission_percentage: e.target.value })
                    }
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cod">Código</Label>
                <Input
                  id="cod"
                  placeholder="Ex: FOAM-001"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="desc">Descrição</Label>
                <Input
                  id="desc"
                  placeholder="Descrição do produto"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="val">Valor do metro (R$)</Label>
                <Input
                  id="val"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.value_per_meter}
                  onChange={(e) =>
                    setForm({ ...form, value_per_meter: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="mar">Margem (%)</Label>
                  <Input
                    id="mar"
                    inputMode="decimal"
                    placeholder="0"
                    value={form.profit_margin}
                    onChange={(e) =>
                      setForm({ ...form, profit_margin: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="per">Perda (%)</Label>
                  <Input
                    id="per"
                    inputMode="decimal"
                    placeholder="0"
                    value={form.waste_percentage}
                    onChange={(e) =>
                      setForm({ ...form, waste_percentage: e.target.value })
                    }
                  />
                </div>
              </div>
              {activeCategory === "Perfil" && (
                <div className="space-y-1.5">
                  <Label htmlFor="fw">Largura da moldura (cm)</Label>
                  <Input
                    id="fw"
                    inputMode="decimal"
                    placeholder="Ex: 3"
                    value={form.frame_width_cm}
                    onChange={(e) =>
                      setForm({ ...form, frame_width_cm: e.target.value })
                    }
                  />
                </div>
              )}
              {activeCategory === "Perfil" && (
                <div className="space-y-1.5">
                  <Label htmlFor="lc">Mão de obra (R$)</Label>
                  <Input
                    id="lc"
                    inputMode="decimal"
                    placeholder="0,00 (opcional)"
                    value={form.labor_cost}
                    onChange={(e) =>
                      setForm({ ...form, labor_cost: e.target.value })
                    }
                  />
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
                    onChange={(e) =>
                      setForm({ ...form, commission_percentage: e.target.value })
                    }
                  />
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
    </AppShell>
  );
}
