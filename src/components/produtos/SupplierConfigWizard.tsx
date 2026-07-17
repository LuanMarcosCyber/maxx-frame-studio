import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type WizardRow = {
  supplier_id: string;
  supplier_name: string;
  category: string;
  product_count: number;
  configured: boolean;
};

type FormValues = {
  margin: string;
  loss: string;
  commission: string;
  labor: string;
};

const emptyValues: FormValues = { margin: "", loss: "", commission: "", labor: "" };

const parseNum = (s: string): number => {
  const cleaned = s.replace(/\./g, "").replace(",", ".").trim();
  if (cleaned === "") return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
};

const EMPTY_MSG = "Preencha este campo para continuar.";
const NEG_MSG = "Valor não pode ser negativo.";
const INVALID_MSG = "Valor inválido.";

function validateField(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return EMPTY_MSG;
  const n = parseNum(trimmed);
  if (!Number.isFinite(n)) return INVALID_MSG;
  if (n < 0) return NEG_MSG;
  return null;
}

export function SupplierConfigWizard({
  open,
  onOpenChange,
  pending,
  ownerUserId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending: WizardRow[];
  ownerUserId?: string | null;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [valuesByStep, setValuesByStep] = useState<Record<number, FormValues>>({});
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Snapshot pending list on open so mid-flow cache invalidations don't shrink the queue.
  const [snapshot, setSnapshot] = useState<WizardRow[]>([]);

  const total = snapshot.length;
  const current = snapshot[step];
  const isPerfil = current?.category === "Perfil";
  const values = valuesByStep[step] ?? emptyValues;

  // Reset when opened, snapshotting the pending list at that moment.
  useEffect(() => {
    if (!open) return;
    setSnapshot(pending);
    setStep(0);
    setValuesByStep({});
    setErrors({});
    setCompletedIds([]);
    setDone(false);
    setJustSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Set default labor for perfil steps
  useEffect(() => {
    if (!current) return;
    setValuesByStep((prev) => {
      if (prev[step]) return prev;
      return {
        ...prev,
        [step]: { ...emptyValues, labor: current.category === "Perfil" ? "15,00" : "" },
      };
    });
    setErrors({});
  }, [step, current]);

  // Sample products for current supplier/category
  const { data: sample } = useQuery({
    queryKey: ["wizard-sample", current?.supplier_id, current?.category, ownerUserId],
    enabled: open && !done && !!current && !!ownerUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("code, description")
        .eq("user_id", ownerUserId!)
        .eq("supplier_id", current!.supplier_id)
        .eq("category", current!.category)
        .order("code", { ascending: true })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as Array<{ code: string; description: string }>;
    },
  });

  const setField = (field: keyof FormValues, value: string) => {
    setValuesByStep((prev) => ({ ...prev, [step]: { ...(prev[step] ?? emptyValues), [field]: value } }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  };

  const validateStep = (): boolean => {
    const errs: Partial<Record<keyof FormValues, string>> = {};
    const m = validateField(values.margin); if (m) errs.margin = m;
    const l = validateField(values.loss); if (l) errs.loss = l;
    const c = validateField(values.commission); if (c) errs.commission = c;
    if (isPerfil) {
      const lb = validateField(values.labor); if (lb) errs.labor = lb;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const apply = async () => {
    if (!current) return;
    if (!validateStep()) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("apply_supplier_default_config", {
        _supplier_id: current.supplier_id,
        _margin: parseNum(values.margin),
        _loss: parseNum(values.loss),
        _commission: parseNum(values.commission),
        _labor_cost: (isPerfil ? parseNum(values.labor) : null) as unknown as number,
      });
      if (error) throw error;
      toast.success(`Configuração aplicada a ${current.product_count} ${current.category}(s) de ${current.supplier_name}.`);
      setCompletedIds((prev) => [...prev, current.supplier_id]);
      await qc.invalidateQueries({ queryKey: ["products"] });
      await qc.invalidateQueries({ queryKey: ["supplier-wizard-state"] });
      setJustSaved(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Falha ao aplicar configuração.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    onOpenChange(false);
  };


  const progressPct = useMemo(() => {
    if (total === 0) return 0;
    if (done) return 100;
    return Math.round((completedIds.length / total) * 100);
  }, [completedIds.length, total, done]);

  const hasNext = step + 1 < total;
  const goNext = () => {
    setJustSaved(false);
    if (hasNext) {
      setStep(step + 1);
    } else {
      setDone(true);
      onOpenChange(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => (!saving && onOpenChange(v))}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[600px] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">
            {justSaved ? "Dados inseridos com sucesso!" : "Configuração inicial do catálogo"}
          </DialogTitle>
        </DialogHeader>

        {justSaved ? (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="h-16 w-16 text-emerald-600" />
              <p className="text-sm text-center text-muted-foreground max-w-sm">
                As configurações comerciais deste fornecedor foram salvas com sucesso.
              </p>
            </div>
            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              {hasNext && (
                <Button variant="outline" className="w-full sm:w-auto" onClick={skip}>
                  Configurar depois
                </Button>
              )}
              <Button className="w-full sm:w-auto" onClick={goNext}>
                {hasNext ? "Configurar próximo" : "Concluir"}
              </Button>
            </DialogFooter>
          </div>
        ) : current ? (
          <div className="space-y-4">
            {/* Progress */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Passo {step + 1} de {total}</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              {total > 1 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] pt-1">
                  {snapshot.map((p, i) => {
                    const isDone = completedIds.includes(p.supplier_id);
                    const isCurrent = i === step;
                    return (
                      <span
                        key={p.supplier_id}
                        className={cn(
                          "inline-flex items-center gap-1",
                          isDone ? "text-emerald-600" : isCurrent ? "text-foreground font-medium" : "text-muted-foreground",
                        )}
                      >
                        {isDone && <CheckCircle2 className="h-3 w-3" />}
                        <span className="truncate max-w-[180px]">
                          {p.supplier_name} {isDone ? "concluída" : isCurrent ? "(atual)" : "pendente"}
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Defina os valores comerciais que sua empresa usará com este fornecedor. Você pode alterar produto por produto depois.
            </p>

            {/* Summary card */}
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-0.5">
              <div className="break-words"><span className="text-muted-foreground">Fornecedor:</span> <b>{current.supplier_name}</b></div>
              <div><span className="text-muted-foreground">Categoria:</span> <b>{current.category}</b></div>
              <div><span className="text-muted-foreground">Produtos que receberão a configuração:</span> <b>{current.product_count}</b></div>
            </div>

            {/* Samples */}
            {sample && sample.length > 0 && (
              <div className="rounded-md border p-3 text-xs">
                <div className="text-muted-foreground mb-1.5">Alguns produtos que receberão esta configuração:</div>
                <ul className="space-y-0.5">
                  {sample.map((p) => (
                    <li key={p.code} className="truncate">
                      <b>{p.code}</b> — {p.description}
                    </li>
                  ))}
                </ul>
                {current.product_count > sample.length && (
                  <div className="mt-1.5 text-muted-foreground">
                    E mais {current.product_count - sample.length} produtos.
                  </div>
                )}
              </div>
            )}

            {/* Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Margem (%)</Label>
                <Input
                  inputMode="decimal"
                  value={values.margin}
                  onChange={(e) => setField("margin", e.target.value)}
                  placeholder="300"
                  className={errors.margin ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {errors.margin && <p className="text-xs text-destructive">{errors.margin}</p>}
              </div>
              <div className="space-y-1">
                <Label>Perda (%)</Label>
                <Input
                  inputMode="decimal"
                  value={values.loss}
                  onChange={(e) => setField("loss", e.target.value)}
                  placeholder="20"
                  className={errors.loss ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {errors.loss && <p className="text-xs text-destructive">{errors.loss}</p>}
              </div>
              <div className="space-y-1">
                <Label>Comissão (%)</Label>
                <Input
                  inputMode="decimal"
                  value={values.commission}
                  onChange={(e) => setField("commission", e.target.value)}
                  placeholder="2"
                  className={errors.commission ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {errors.commission && <p className="text-xs text-destructive">{errors.commission}</p>}
              </div>
              {isPerfil && (
                <div className="space-y-1">
                  <Label>Mão de obra (R$/m)</Label>
                  <Input
                    inputMode="decimal"
                    value={values.labor}
                    onChange={(e) => setField("labor", e.target.value)}
                    placeholder="15,00"
                    className={errors.labor ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {errors.labor && <p className="text-xs text-destructive">{errors.labor}</p>}
                </div>
              )}
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={skip}
                disabled={saving}
              >
                Configurar depois
              </Button>
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={apply}
                disabled={saving}
              >
                {saving ? "Salvando..." : step + 1 < total ? "Aplicar e continuar" : "Concluir configuração"}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export type { WizardRow };
