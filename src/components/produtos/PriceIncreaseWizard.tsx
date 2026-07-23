import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Loader2,
  Globe2,
  DollarSign,
  Percent,
  Hammer,
  Wallet,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  SupplierPicker,
  useSuppliersQuery,
  supplierLabel,
} from "@/components/suppliers/SupplierPicker";
import { fmtMoney } from "@/lib/utils";

const CATEGORIES = [
  { key: "Foam", label: "Foam", supplierCat: "foam" },
  { key: "Paspatur", label: "Paspatur", supplierCat: "paspatur" },
  { key: "Impressão", label: "Impressão", supplierCat: "impressao" },
  { key: "Perfil", label: "Perfil", supplierCat: "perfil" },
  { key: "Vidro", label: "Vidro", supplierCat: "vidro" },
  { key: "Colagem", label: "Colagem", supplierCat: "colagem" },
  { key: "produtos_diversos", label: "Produtos Diversos", supplierCat: "diversos" },
] as const;

type Direction = "increase" | "decrease";
type Field = "cost" | "margin" | "loss" | "commission" | "labor";
type SampleRowCost = {
  code: string;
  description: string;
  current_price: number;
  new_price: number;
};
type SampleRowConfig = {
  code: string;
  description: string;
  current_value: number | null;
  new_value: number;
};

const FIELDS: {
  key: Field;
  label: string;
  Icon: typeof DollarSign;
  desc: string;
}[] = [
  { key: "cost", label: "Custo do m² / metro linear", Icon: DollarSign, desc: "Reajuste percentual sobre o custo atual." },
  { key: "margin", label: "Margem de lucro", Icon: Sparkles, desc: "Substitui a margem dos produtos." },
  { key: "loss", label: "Perda", Icon: Percent, desc: "Substitui o percentual de perda." },
  { key: "labor", label: "Mão de obra", Icon: Hammer, desc: "Substitui o valor de mão de obra." },
  { key: "commission", label: "Comissão", Icon: Wallet, desc: "Substitui o percentual de comissão." },
];

const parseNum = (s: string) => {
  const cleaned = s.replace(/\./g, "").replace(",", ".").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
};

const sanitizeMoney = (v: string): string => {
  let s = (v ?? "").replace(/[^\d.,]/g, "");
  const idx = s.search(/[.,]/);
  if (idx >= 0) {
    const before = s.slice(0, idx);
    const sep = s[idx];
    const after = s.slice(idx + 1).replace(/[.,]/g, "").slice(0, 2);
    s = before + sep + after;
  }
  return s;
};

function costLabelFor(cat: string) {
  if (cat === "Perfil") return "Custo do metro linear";
  if (cat === "produtos_diversos") return "Custo";
  return "Custo do m²";
}

export function PriceIncreaseWizard({
  open,
  onOpenChange,
  initialCategory,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialCategory?: string;
}) {
  const qc = useQueryClient();
  const { data: suppliers = [] } = useSuppliersQuery();

  // Step is a semantic key; total steps depend on field.
  type StepKey =
    | "field"
    | "direction"
    | "category"
    | "supplier"
    | "value"
    | "review"
    | "done";

  const [field, setField] = useState<Field | null>(null);
  const [step, setStep] = useState<StepKey>("field");
  const [direction, setDirection] = useState<Direction | null>(null);
  const [category, setCategory] = useState<string>(initialCategory ?? "Foam");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [valueText, setValueText] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewSampleCost, setPreviewSampleCost] = useState<SampleRowCost[]>([]);
  const [previewSampleCfg, setPreviewSampleCfg] = useState<SampleRowConfig[]>([]);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ affected: number } | null>(null);

  const isCost = field === "cost";

  const stepOrder: StepKey[] = isCost
    ? ["field", "direction", "category", "supplier", "value", "review", "done"]
    : ["field", "category", "supplier", "value", "review", "done"];
  const stepIndex = stepOrder.indexOf(step) + 1;
  const totalSteps = stepOrder.length - 1; // exclude "done" from numbering

  const supplierCat = useMemo(
    () => CATEGORIES.find((c) => c.key === category)?.supplierCat ?? null,
    [category],
  );
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );
  const valueNum = parseNum(valueText);
  const isDecrease = direction === "decrease";
  const isGlobalSupplier = selectedSupplier?.is_global === true;

  const valueValid = (() => {
    if (Number.isNaN(valueNum) || valueNum < 0) return false;
    if (field === "cost") {
      if (valueNum <= 0) return false;
      if (direction === "decrease" && valueNum >= 100) return false;
      return true;
    }
    if (field === "loss" || field === "commission") return valueNum <= 100;
    return true;
  })();

  const reset = () => {
    setField(null);
    setStep("field");
    setDirection(null);
    setCategory(initialCategory ?? "Foam");
    setSupplierId(null);
    setValueText("");
    setPreviewTotal(0);
    setPreviewSampleCost([]);
    setPreviewSampleCfg([]);
    setResult(null);
  };

  const handleClose = (v: boolean) => {
    if (!v && !applying) reset();
    onOpenChange(v);
  };

  const goNext = () => {
    const idx = stepOrder.indexOf(step);
    if (idx < stepOrder.length - 1) setStep(stepOrder[idx + 1]);
  };
  const goBack = () => {
    const idx = stepOrder.indexOf(step);
    if (idx > 0) setStep(stepOrder[idx - 1]);
  };

  const loadPreview = async () => {
    if (!supplierId || !valueValid || !field) return;
    setLoadingPreview(true);
    try {
      if (field === "cost") {
        if (!direction) return;
        const { data, error } = await supabase.rpc("preview_price_increase", {
          _category: category,
          _supplier_id: supplierId,
          _percentage: valueNum,
          _direction: direction,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        setPreviewTotal(Number(row?.total ?? 0));
        setPreviewSampleCost((row?.sample ?? []) as SampleRowCost[]);
        setPreviewSampleCfg([]);
      } else {
        const { data, error } = await supabase.rpc("preview_bulk_config_change", {
          _field: field,
          _category: category,
          _supplier_id: supplierId,
          _new_value: valueNum,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        setPreviewTotal(Number(row?.total ?? 0));
        setPreviewSampleCfg((row?.sample ?? []) as SampleRowConfig[]);
        setPreviewSampleCost([]);
      }
      setStep("review");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar prévia.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const apply = async () => {
    if (!supplierId || !valueValid || !field) return;
    setApplying(true);
    try {
      let affected = 0;
      if (field === "cost") {
        if (!direction) return;
        const { data, error } = await supabase.rpc("apply_price_increase", {
          _category: category,
          _supplier_id: supplierId,
          _percentage: valueNum,
          _direction: direction,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        affected = Number(row?.products_affected ?? 0);
      } else {
        const { data, error } = await supabase.rpc("apply_bulk_config_change", {
          _field: field,
          _category: category,
          _supplier_id: supplierId,
          _new_value: valueNum,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        affected = Number(row?.products_affected ?? 0);
      }
      setResult({ affected });
      setStep("done");
      await qc.invalidateQueries({ queryKey: ["products"] });
      const fLabel = FIELDS.find((f) => f.key === field)?.label ?? "";
      toast.success(
        field === "cost"
          ? `${isDecrease ? "Redução" : "Aumento"} aplicado em ${affected} produto(s).`
          : `${fLabel} atualizada com sucesso em ${affected} produto(s).`,
      );
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao aplicar alteração.");
    } finally {
      setApplying(false);
    }
  };

  const catLabel =
    CATEGORIES.find((c) => c.key === category)?.label ?? category;
  const fieldMeta = FIELDS.find((f) => f.key === field);
  const HeaderIcon =
    field === "cost"
      ? isDecrease
        ? TrendingDown
        : TrendingUp
      : fieldMeta?.Icon ?? DollarSign;

  const valueLabel = (() => {
    if (field === "cost")
      return isDecrease ? "Qual foi a redução?" : "Qual foi o aumento?";
    if (field === "margin") return "Nova margem de lucro (%)";
    if (field === "loss") return "Nova perda (%)";
    if (field === "commission") return "Nova comissão (%)";
    if (field === "labor") return "Novo valor de mão de obra (R$)";
    return "Novo valor";
  })();

  const valueSuffix =
    field === "labor" ? null : field === "cost" || field === "margin" || field === "loss" || field === "commission" ? "%" : null;

  const formattedValue = (() => {
    if (field === "labor") return fmtMoney(valueNum || 0);
    return `${(valueNum || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  })();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeaderIcon className="h-5 w-5 text-brand" />
            Alteração em Massa — Etapa {stepIndex} de {totalSteps}
          </DialogTitle>
          <DialogDescription>
            Ajuste em massa por categoria e fornecedor, aplicado apenas à empresa
            atual.
          </DialogDescription>
        </DialogHeader>

        {step === "field" && (
          <div className="space-y-3">
            <Label>Qual campo você deseja alterar?</Label>
            <div className="grid grid-cols-1 gap-2">
              {FIELDS.map((f) => {
                const active = field === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setField(f.key)}
                    className={`px-3 py-2.5 rounded-md border text-sm text-left transition flex items-start gap-3 ${
                      active
                        ? "bg-gradient-brand text-brand-foreground border-transparent shadow-brand"
                        : "bg-background hover:bg-accent"
                    }`}
                  >
                    <f.Icon className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium">{f.label}</div>
                      <div className={`text-xs ${active ? "opacity-90" : "text-muted-foreground"}`}>
                        {f.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === "direction" && (
          <div className="space-y-3">
            <Label>Qual tipo de alteração será aplicada?</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["increase", "decrease"] as Direction[]).map((d) => {
                const active = direction === d;
                const DIcon = d === "decrease" ? TrendingDown : TrendingUp;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDirection(d)}
                    className={`px-3 py-3 rounded-md border text-sm text-left transition flex items-center gap-2 ${
                      active
                        ? "bg-gradient-brand text-brand-foreground border-transparent shadow-brand"
                        : "bg-background hover:bg-accent"
                    }`}
                  >
                    <DIcon className="h-4 w-4" />
                    {d === "increase" ? "Aumento" : "Redução"}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === "category" && (
          <div className="space-y-3">
            <Label>Qual categoria de produto será alterada?</Label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={`px-3 py-2 rounded-md border text-sm text-left transition ${
                    category === c.key
                      ? "bg-gradient-brand text-brand-foreground border-transparent shadow-brand"
                      : "bg-background hover:bg-accent"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {field === "cost" && (
              <p className="text-xs text-muted-foreground">
                Campo de custo utilizado nesta categoria:{" "}
                <strong>{costLabelFor(category)}</strong>.
              </p>
            )}
          </div>
        )}

        {step === "supplier" && (
          <div className="space-y-3">
            <Label>Qual fornecedor será alterado?</Label>
            <SupplierPicker
              value={supplierId}
              onChange={(id) => setSupplierId(id)}
              preferredCategory={supplierCat ?? undefined}
              placeholder="Selecione um fornecedor..."
            />
            {selectedSupplier && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <span>Selecionado:</span>
                <strong>{supplierLabel(selectedSupplier)}</strong>
                {selectedSupplier.is_global && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    <Globe2 className="h-3 w-3 mr-1" /> Global
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}

        {step === "value" && (
          <div className="space-y-3">
            <Label htmlFor="val">{valueLabel}</Label>
            <div className="relative">
              <Input
                id="val"
                inputMode="decimal"
                placeholder={field === "labor" ? "Ex: 15,00" : "Ex: 5 ou 12,5"}
                value={valueText}
                onChange={(e) =>
                  setValueText(
                    field === "labor"
                      ? sanitizeMoney(e.target.value)
                      : sanitizeMoney(e.target.value),
                  )
                }
              />
              {valueSuffix && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                  {valueSuffix}
                </span>
              )}
            </div>
            {valueText && !valueValid && (
              <p className="text-xs text-destructive">
                {field === "cost" && isDecrease
                  ? "Informe um percentual maior que zero e menor que 100%."
                  : field === "cost"
                    ? "Informe um percentual maior que zero."
                    : field === "loss" || field === "commission"
                      ? "Informe um valor entre 0 e 100."
                      : "Informe um valor válido (maior ou igual a zero)."}
              </p>
            )}
            {field !== "cost" && (
              <p className="text-xs text-muted-foreground">
                Este valor <strong>substitui</strong> o valor atual em todos os
                produtos selecionados.
              </p>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="space-y-3">
            <div className="rounded-md border p-3 space-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Campo:</span>{" "}
                <strong>
                  {field === "cost" ? costLabelFor(category) : fieldMeta?.label}
                </strong>
              </div>
              {field === "cost" && (
                <div>
                  <span className="text-muted-foreground">Tipo:</span>{" "}
                  <strong>{isDecrease ? "Redução" : "Aumento"}</strong>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Categoria:</span>{" "}
                <strong>{catLabel}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Fornecedor:</span>{" "}
                <strong>
                  {selectedSupplier ? supplierLabel(selectedSupplier) : "—"}
                </strong>
                {isGlobalSupplier && (
                  <Badge variant="secondary" className="ml-2 text-[10px] h-5">
                    <Globe2 className="h-3 w-3 mr-1" /> Global
                  </Badge>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">
                  {field === "cost" ? "Percentual:" : "Novo valor:"}
                </span>{" "}
                <strong>{formattedValue}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Produtos afetados:</span>{" "}
                <strong>{previewTotal}</strong>
              </div>
            </div>

            {field === "cost" && previewSampleCost.length > 0 && (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-2 py-1.5 font-medium">Código</th>
                      <th className="px-2 py-1.5 font-medium">Produto</th>
                      <th className="px-2 py-1.5 font-medium text-right">Anterior</th>
                      <th className="px-2 py-1.5 font-medium text-right">Novo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previewSampleCost.map((r) => (
                      <tr key={r.code}>
                        <td className="px-2 py-1.5 font-mono">{r.code}</td>
                        <td className="px-2 py-1.5 truncate max-w-[140px]">{r.description}</td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">{fmtMoney(r.current_price)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold">{fmtMoney(r.new_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewTotal > previewSampleCost.length && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground bg-muted/30">
                    Mostrando amostra de {previewSampleCost.length}. Total: {previewTotal}.
                  </div>
                )}
              </div>
            )}

            {field !== "cost" && previewSampleCfg.length > 0 && (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-2 py-1.5 font-medium">Código</th>
                      <th className="px-2 py-1.5 font-medium">Produto</th>
                      <th className="px-2 py-1.5 font-medium text-right">Atual</th>
                      <th className="px-2 py-1.5 font-medium text-right">Novo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previewSampleCfg.map((r) => (
                      <tr key={r.code}>
                        <td className="px-2 py-1.5 font-mono">{r.code}</td>
                        <td className="px-2 py-1.5 truncate max-w-[140px]">{r.description}</td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">
                          {r.current_value == null
                            ? "—"
                            : field === "labor"
                              ? fmtMoney(r.current_value)
                              : `${Number(r.current_value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold">
                          {field === "labor"
                            ? fmtMoney(r.new_value)
                            : `${Number(r.new_value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewTotal > previewSampleCfg.length && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground bg-muted/30">
                    Mostrando amostra de {previewSampleCfg.length}. Total: {previewTotal}.
                  </div>
                )}
              </div>
            )}

            {previewTotal === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum produto encontrado para essa combinação.
              </p>
            )}

            {previewTotal > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  Esta alteração será aplicada somente aos produtos utilizados
                  pela empresa atual. O catálogo global e as demais empresas não
                  serão modificados.
                  <div className="mt-1">
                    <strong>{previewTotal}</strong> produtos serão atualizados.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3">
            <div className="rounded-md border border-green-500/40 bg-green-500/5 p-4 text-sm">
              <div className="font-semibold text-green-700 mb-2">
                Alteração concluída com sucesso.
              </div>
              <ul className="space-y-1 text-muted-foreground">
                <li>
                  Campo:{" "}
                  <strong className="text-foreground">
                    {field === "cost" ? costLabelFor(category) : fieldMeta?.label}
                  </strong>
                </li>
                {field === "cost" && (
                  <li>
                    Tipo:{" "}
                    <strong className="text-foreground">
                      {isDecrease ? "Redução" : "Aumento"}
                    </strong>
                  </li>
                )}
                <li>
                  Categoria:{" "}
                  <strong className="text-foreground">{catLabel}</strong>
                </li>
                <li>
                  Fornecedor:{" "}
                  <strong className="text-foreground">
                    {selectedSupplier ? supplierLabel(selectedSupplier) : "—"}
                  </strong>
                </li>
                <li>
                  {field === "cost" ? "Percentual: " : "Novo valor: "}
                  <strong className="text-foreground">{formattedValue}</strong>
                </li>
                <li>
                  Produtos atualizados:{" "}
                  <strong className="text-foreground">{result.affected}</strong>
                </li>
              </ul>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "field" && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
              <Button onClick={goNext} disabled={!field}>
                Próximo
              </Button>
            </>
          )}
          {step === "direction" && (
            <>
              <Button variant="outline" onClick={goBack}>Voltar</Button>
              <Button onClick={goNext} disabled={!direction}>Próximo</Button>
            </>
          )}
          {step === "category" && (
            <>
              <Button variant="outline" onClick={goBack}>Voltar</Button>
              <Button onClick={goNext}>Próximo</Button>
            </>
          )}
          {step === "supplier" && (
            <>
              <Button variant="outline" onClick={goBack}>Voltar</Button>
              <Button onClick={goNext} disabled={!supplierId}>
                Próximo
              </Button>
            </>
          )}
          {step === "value" && (
            <>
              <Button variant="outline" onClick={goBack}>Voltar</Button>
              <Button onClick={loadPreview} disabled={!valueValid || loadingPreview}>
                {loadingPreview && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Próximo
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" onClick={goBack} disabled={applying}>
                Voltar
              </Button>
              <Button
                onClick={apply}
                disabled={applying || previewTotal === 0}
                className="bg-gradient-brand text-brand-foreground shadow-brand"
              >
                {applying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Confirmar alteração
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => handleClose(false)}>Concluir</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
