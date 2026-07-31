import { useEffect, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { UserCircle2, KeyRound, ArrowLeft } from "lucide-react";
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
import { useAuth } from "@/hooks/useAuth";
import { clearActiveCompany } from "@/lib/company-switch.functions";
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
  /** Selection is mandatory: modal cannot be dismissed without choosing a user. */
  mandatory?: boolean;
};

export function OperatorSwitcher({
  open: openProp,
  onOpenChange,
  hideTrigger,
  onSwitched,
  mandatory,
}: OperatorSwitcherProps = {}) {
  const { activeOperator, setActiveOperator } = useOperator();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? !!openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (!v && mandatory && !allowCloseRef.current) return;
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };
  const allowCloseRef = useRef(false);
  const [step, setStep] = useState<"choose" | "pin">("choose");
  const [selected, setSelected] = useState<Op | null>(null);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const clearActiveCompanyFn = useServerFn(clearActiveCompany);

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
      toast.success(`Usuário ativo: ${(result as { full_name: string }).full_name}`);
      onSwitched?.(selected);
      allowCloseRef.current = true;
      setOpen(false);
      allowCloseRef.current = false;

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PIN incorreto.");
    } finally {
      setSubmitting(false);
    }
  }

  function clear() {
    setActiveOperator(null);
    toast.success("Usuário removido.");
  }

  /** Sai da empresa sem exigir PIN, voltando para a tela de login. */
  async function leaveCompany() {
    if (leaving) return;
    setLeaving(true);
    try {
      setActiveOperator(null);
      try {
        await clearActiveCompanyFn();
      } catch {
        // best-effort
      }
      await qc.cancelQueries();
      qc.clear();
      await signOut();
      navigate({ to: "/login", replace: true });
    } finally {
      setLeaving(false);
    }
  }


  return (
    <>
      {!hideTrigger && (
      <button

        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/15 border border-white/10 transition text-xs sm:text-sm"
        title={activeOperator ? "Trocar usuário" : "Selecionar usuário"}
      >
        <UserCircle2 className="h-4 w-4" />
        <span className="truncate max-w-[140px]">
          {activeOperator ? (
            <>
              <span className="opacity-70">Usuário:</span>{" "}
              <span className="font-medium">{activeOperator.full_name}</span>
            </>
          ) : (
            <span className="opacity-80">Selecionar usuário</span>
          )}
        </span>
      </button>
      )}


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-md"
          hideClose={mandatory}
          onEscapeKeyDown={(e) => {
            if (mandatory) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (mandatory) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (mandatory) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {step === "choose"
                ? mandatory
                  ? "Quem está utilizando o sistema?"
                  : "Selecionar usuário"
                : `PIN de ${selected?.full_name ?? ""}`}
            </DialogTitle>
            <DialogDescription>
              {step === "choose"
                ? "Escolha o usuário que está operando o sistema neste momento."
                : "Digite o PIN de 4 a 6 dígitos para ativar o usuário."}
            </DialogDescription>
          </DialogHeader>

          {step === "choose" ? (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
              ) : operators.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhum usuário cadastrado.
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
                          toast.error("Este usuário ainda não possui PIN cadastrado.");
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
              {activeOperator && !mandatory && (
                <div className="pt-2 border-t">
                  <Button variant="outline" className="w-full" onClick={clear}>
                    Remover usuário ativo
                  </Button>
                </div>
              )}
              {/* Saída sem PIN — evita que alguém fique preso na empresa
                  quando não souber o PIN de nenhum usuário. */}
              <div className="pt-2 border-t">
                <button
                  type="button"
                  onClick={leaveCompany}
                  disabled={leaving}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-destructive transition disabled:opacity-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {leaving ? "Saindo..." : "Sair da empresa"}
                </button>
              </div>
            </div>

          ) : (
            <form onSubmit={confirmPin} className="space-y-4" data-enter="submit">
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
