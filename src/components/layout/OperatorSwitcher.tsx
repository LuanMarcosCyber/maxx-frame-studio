import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { UserCircle2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOperator } from "@/hooks/useOperator";
import { listActiveOperatorsV2, validateOperatorPinV2 } from "@/lib/operators.functions";

type Op = { id: string; full_name: string; username: string | null; has_pin: boolean };

export type OperatorSwitcherProps = {
  /** Controlled open state (optional). When provided, the internal trigger is hidden by default. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hide the header trigger button. Useful when opened externally. */
  hideTrigger?: boolean;
  /** Called after an operator is successfully activated via PIN. */
  onSwitched?: (op: Op) => void;
};

export function OperatorSwitcher({
  open: openProp,
  onOpenChange,
  hideTrigger,
  onSwitched,
}: OperatorSwitcherProps = {}) {
  const { activeOperator, setActiveOperator } = useOperator();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? !!openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };
  const [step, setStep] = useState<"choose" | "pin">("choose");
  const [selected, setSelected] = useState<Op | null>(null);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const list = useServerFn(listActiveOperatorsV2);

  const validate = useServerFn(validateOperatorPinV2);

  const { data: operators = [], isLoading } = useQuery<Op[]>({
    queryKey: ["active-operators"],
    queryFn: () => list() as Promise<Op[]>,
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setStep("choose");
      setSelected(null);
      setPin("");
    }
  }, [open]);

  async function confirmPin(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    try {
      const result = await validate({ data: { operator_id: selected.id, pin } });
      setActiveOperator(result as never);
      toast.success(`Operador ativo: ${(result as { full_name: string }).full_name}`);
      onSwitched?.(selected);
      setOpen(false);

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PIN incorreto.");
    } finally {
      setSubmitting(false);
    }
  }

  function clear() {
    setActiveOperator(null);
    toast.success("Operador removido.");
  }

  return (
    <>
      {!hideTrigger && (
      <button

        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/15 border border-white/10 transition text-xs sm:text-sm"
        title={activeOperator ? "Trocar operador" : "Selecionar operador"}
      >
        <UserCircle2 className="h-4 w-4" />
        <span className="truncate max-w-[140px]">
          {activeOperator ? (
            <>
              <span className="opacity-70">Operador:</span>{" "}
              <span className="font-medium">{activeOperator.full_name}</span>
            </>
          ) : (
            <span className="opacity-80">Selecionar operador</span>
          )}
        </span>
      </button>
      )}


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {step === "choose" ? "Selecionar operador" : `PIN de ${selected?.full_name ?? ""}`}
            </DialogTitle>
            <DialogDescription>
              {step === "choose"
                ? "Escolha o colaborador que está operando o sistema neste momento."
                : "Digite o PIN de 4 a 6 dígitos para ativar o operador."}
            </DialogDescription>
          </DialogHeader>

          {step === "choose" ? (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
              ) : operators.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhum colaborador ativo cadastrado.
                </p>
              ) : (
                operators.map((op) => {
                  const isActive = activeOperator?.id === op.id;
                  return (
                    <button
                      key={op.id}
                      type="button"
                      disabled={isActive}
                      aria-disabled={isActive}
                      onClick={() => {
                        if (isActive) return;
                        if (!op.has_pin) {
                          toast.error("Este colaborador ainda não possui PIN cadastrado.");
                          return;
                        }
                        setSelected(op);
                        setStep("pin");
                      }}
                      className={
                        "w-full flex items-center justify-between rounded-md border p-3 text-left transition " +
                        (isActive
                          ? "opacity-90 cursor-not-allowed bg-accent/40"
                          : "hover:bg-accent")
                      }
                    >
                      <div>
                        <div className="font-medium">{op.full_name}</div>
                        {op.username && (
                          <div className="text-[11px] text-muted-foreground font-mono">
                            @{op.username}
                          </div>
                        )}
                      </div>
                      {isActive ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gradient-brand text-brand-foreground">
                          Em uso
                        </span>
                      ) : !op.has_pin ? (
                        <span className="text-[11px] text-amber-600">Sem PIN</span>
                      ) : null}
                    </button>
                  );
                })

              )}
              {activeOperator && (
                <div className="pt-2 border-t">
                  <Button variant="outline" className="w-full" onClick={clear}>
                    Remover operador ativo
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={confirmPin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="op_pin">PIN</Label>
                <Input
                  id="op_pin"
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  pattern="\d{4,6}"
                  minLength={4}
                  maxLength={6}
                  placeholder="••••"
                  required
                />
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setStep("choose")}>
                  Voltar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || pin.length < 4}
                  className="bg-gradient-brand text-brand-foreground hover:opacity-95"
                >
                  <KeyRound className="h-4 w-4 mr-2" />
                  {submitting ? "Validando..." : "Ativar"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
