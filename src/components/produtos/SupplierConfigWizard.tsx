import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type WizardRow = {
  supplier_id: string;
  supplier_name: string;
  category: string;
  product_count: number;
  configured: boolean;
};

const parseNum = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : NaN;
};

export function SupplierConfigWizard({
  open,
  onOpenChange,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending: WizardRow[];
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [margin, setMargin] = useState("");
  const [loss, setLoss] = useState("");
  const [commission, setCommission] = useState("");
  const [labor, setLabor] = useState("");
  const [saving, setSaving] = useState(false);

  const current = pending[step];
  const isPerfil = current?.category === "Perfil";

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setMargin("");
    setLoss("");
    setCommission("");
    setLabor("15,00");
  }, [open]);

  useEffect(() => {
    setLabor(pending[step]?.category === "Perfil" ? "15,00" : "");
  }, [step, pending]);

  const canApply = useMemo(() => {
    const m = parseNum(margin), l = parseNum(loss), c = parseNum(commission);
    if (!Number.isFinite(m) || !Number.isFinite(l) || !Number.isFinite(c)) return false;
    if (isPerfil) {
      const lb = parseNum(labor);
      if (!Number.isFinite(lb)) return false;
    }
    return true;
  }, [margin, loss, commission, labor, isPerfil]);

  if (!current) return null;

  const apply = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("apply_supplier_default_config", {
        _supplier_id: current.supplier_id,
        _margin: parseNum(margin),
        _loss: parseNum(loss),
        _commission: parseNum(commission),
        _labor_cost: (isPerfil ? parseNum(labor) : null) as unknown as number,
      });
      if (error) throw error;
      toast.success(`Configuração aplicada a ${current.product_count} ${current.category}(s) de ${current.supplier_name}.`);
      await qc.invalidateQueries({ queryKey: ["products"] });
      await qc.invalidateQueries({ queryKey: ["supplier-wizard-state"] });
      if (step + 1 < pending.length) {
        setStep(step + 1);
      } else {
        onOpenChange(false);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao aplicar configuração.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!saving && onOpenChange(v))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configuração inicial do catálogo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Seu catálogo inicial já foi configurado automaticamente. Agora precisamos definir como sua empresa
            irá trabalhar com esses produtos.
          </p>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div><span className="text-muted-foreground">Passo</span> <b>{step + 1}</b> de {pending.length}</div>
            <div><span className="text-muted-foreground">Fornecedor:</span> <b>{current.supplier_name}</b></div>
            <div><span className="text-muted-foreground">Produtos encontrados:</span> <b>{current.product_count}</b> {current.category}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Margem (%)</Label>
              <Input inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} placeholder="300" />
            </div>
            <div>
              <Label>Perda (%)</Label>
              <Input inputMode="decimal" value={loss} onChange={(e) => setLoss(e.target.value)} placeholder="20" />
            </div>
            <div>
              <Label>Comissão (%)</Label>
              <Input inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="2" />
            </div>
            {isPerfil && (
              <div>
                <Label>Mão de obra (R$/m)</Label>
                <Input inputMode="decimal" value={labor} onChange={(e) => setLabor(e.target.value)} placeholder="15,00" />
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={apply} disabled={!canApply || saving}>
            {saving ? "Aplicando..." : `Aplicar a todos os ${current.category.toLowerCase()} de ${current.supplier_name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { WizardRow };
