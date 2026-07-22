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
import { AlertTriangle, TrendingUp, TrendingDown, Loader2, Globe2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SupplierPicker, useSuppliersQuery, supplierLabel } from "@/components/suppliers/SupplierPicker";
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

type Step = 1 | 2 | 3 | 4 | 5 | 6;
type Direction = "increase" | "decrease";
type SampleRow = { code: string; description: string; current_price: number; new_price: number };

const parseNum = (s: string) => {
  const cleaned = s.replace(/\./g, "").replace(",", ".").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
};

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

  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<Direction | null>(null);
  const [category, setCategory] = useState<string>(initialCategory ?? "Foam");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [percentText, setPercentText] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewSample, setPreviewSample] = useState<SampleRow[]>([]);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ affected: number } | null>(null);

  const supplierCat = useMemo(
    () => CATEGORIES.find((c) => c.key === category)?.supplierCat ?? null,
    [category],
  );
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );
  const percent = parseNum(percentText);
  const percentValid =
    !Number.isNaN(percent) &&
    percent > 0 &&
    (direction === "increase" || percent < 100);
  const isGlobalSupplier = selectedSupplier?.is_global === true;
  const isDecrease = direction === "decrease";

  const reset = () => {
    setStep(1);
    setDirection(null);
    setCategory(initialCategory ?? "Foam");
    setSupplierId(null);
    setPercentText("");
    setPreviewTotal(0);
    setPreviewSample([]);
    setResult(null);
  };

  const handleClose = (v: boolean) => {
    if (!v && !applying) reset();
    onOpenChange(v);
  };

  const goPreview = async () => {
    if (!supplierId || !percentValid || !direction) return;
    setLoadingPreview(true);
    try {
      const { data, error } = await supabase.rpc("preview_price_increase", {
        _category: category,
        _supplier_id: supplierId,
        _percentage: percent,
        _direction: direction,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setPreviewTotal(Number(row?.total ?? 0));
      setPreviewSample((row?.sample ?? []) as SampleRow[]);
      setStep(5);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar prévia.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const applyChange = async () => {
    if (!supplierId || !percentValid || !direction) return;
    setApplying(true);
    try {
      const { data, error } = await supabase.rpc("apply_price_increase", {
        _category: category,
        _supplier_id: supplierId,
        _percentage: percent,
        _direction: direction,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const affected = Number(row?.products_affected ?? 0);
      setResult({ affected });
      setStep(6);
      await qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(
        `${isDecrease ? "Redução" : "Aumento"} aplicado em ${affected} produto(s).`,
      );
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao aplicar alteração.");
    } finally {
      setApplying(false);
    }
  };

  const catLabel = CATEGORIES.find((c) => c.key === category)?.label ?? category;
  const dirLabel = isDecrease ? "Redução" : "Aumento";
  const Icon = isDecrease ? TrendingDown : TrendingUp;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-brand" />
            Alteração nos preços — Etapa {step} de 6
          </DialogTitle>
          <DialogDescription>
            Ajuste em massa por categoria e fornecedor, aplicado apenas à empresa
            atual.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
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

        {step === 2 && (
          <div className="space-y-3">
            <Label>Qual categoria de produto teve alteração de preço?</Label>
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
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <Label>Qual fornecedor teve alteração de preço?</Label>
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

        {step === 4 && (
          <div className="space-y-3">
            <Label htmlFor="pct">
              Qual foi {isDecrease ? "a redução" : "o aumento"} de preço?
            </Label>
            <div className="relative">
              <Input
                id="pct"
                inputMode="decimal"
                placeholder="Ex: 5 ou 12,5"
                value={percentText}
                onChange={(e) => setPercentText(e.target.value)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                %
              </span>
            </div>
            {percentText && !percentValid && (
              <p className="text-xs text-destructive">
                {isDecrease
                  ? "Informe um percentual maior que zero e menor que 100%."
                  : "Informe um percentual maior que zero."}
              </p>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <div className="rounded-md border p-3 space-y-1 text-sm">
              <div><span className="text-muted-foreground">Tipo:</span> <strong>{dirLabel}</strong></div>
              <div><span className="text-muted-foreground">Categoria:</span> <strong>{catLabel}</strong></div>
              <div>
                <span className="text-muted-foreground">Fornecedor:</span>{" "}
                <strong>{selectedSupplier ? supplierLabel(selectedSupplier) : "—"}</strong>
                {isGlobalSupplier && (
                  <Badge variant="secondary" className="ml-2 text-[10px] h-5">
                    <Globe2 className="h-3 w-3 mr-1" /> Global
                  </Badge>
                )}
              </div>
              <div><span className="text-muted-foreground">Percentual:</span> <strong>{percent.toLocaleString("pt-BR")}%</strong></div>
              <div>
                <span className="text-muted-foreground">Produtos afetados:</span>{" "}
                <strong>{previewTotal}</strong>
              </div>
            </div>

            {previewSample.length > 0 && (
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
                    {previewSample.map((r) => (
                      <tr key={r.code}>
                        <td className="px-2 py-1.5 font-mono">{r.code}</td>
                        <td className="px-2 py-1.5 truncate max-w-[140px]">{r.description}</td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">{fmtMoney(r.current_price)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold">{fmtMoney(r.new_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewTotal > previewSample.length && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground bg-muted/30">
                    Mostrando amostra de {previewSample.length}. Total: {previewTotal}.
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
                  Você confirma {isDecrease ? "a redução" : "o aumento"} de{" "}
                  <strong>{percent.toLocaleString("pt-BR")}%</strong> em todos os
                  produtos da categoria <strong>{catLabel}</strong> do fornecedor{" "}
                  <strong>{selectedSupplier ? supplierLabel(selectedSupplier) : "—"}</strong>?
                  <div className="mt-1 text-muted-foreground">
                    Esta alteração será aplicada somente aos preços utilizados pela
                    empresa atual e não modificará o catálogo global nem os preços
                    de outras empresas.
                  </div>
                  <div className="mt-1"><strong>{previewTotal}</strong> produtos serão atualizados.</div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 6 && result && (
          <div className="space-y-3">
            <div className="rounded-md border border-green-500/40 bg-green-500/5 p-4 text-sm">
              <div className="font-semibold text-green-700 mb-2">
                Alteração concluída com sucesso.
              </div>
              <ul className="space-y-1 text-muted-foreground">
                <li>Tipo: <strong className="text-foreground">{dirLabel}</strong></li>
                <li>Categoria: <strong className="text-foreground">{catLabel}</strong></li>
                <li>Fornecedor: <strong className="text-foreground">{selectedSupplier ? supplierLabel(selectedSupplier) : "—"}</strong></li>
                <li>Percentual: <strong className="text-foreground">{percent.toLocaleString("pt-BR")}%</strong></li>
                <li>Produtos atualizados: <strong className="text-foreground">{result.affected}</strong></li>
              </ul>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button onClick={() => setStep(2)} disabled={!direction}>Próximo</Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
              <Button onClick={() => setStep(3)}>Próximo</Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
              <Button onClick={() => setStep(4)} disabled={!supplierId}>
                Próximo
              </Button>
            </>
          )}
          {step === 4 && (
            <>
              <Button variant="outline" onClick={() => setStep(3)}>Voltar</Button>
              <Button onClick={goPreview} disabled={!percentValid || loadingPreview}>
                {loadingPreview && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Próximo
              </Button>
            </>
          )}
          {step === 5 && (
            <>
              <Button variant="outline" onClick={() => setStep(4)} disabled={applying}>
                Voltar
              </Button>
              <Button
                onClick={applyChange}
                disabled={applying || previewTotal === 0}
                className="bg-gradient-brand text-brand-foreground shadow-brand"
              >
                {applying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Confirmar {isDecrease ? "redução" : "aumento"}
              </Button>
            </>
          )}
          {step === 6 && (
            <Button onClick={() => handleClose(false)}>Concluir</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
