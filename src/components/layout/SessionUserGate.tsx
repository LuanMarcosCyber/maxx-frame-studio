import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { useOperator } from "@/hooks/useOperator";
import { listActiveOperatorsV2 } from "@/lib/operators.functions";
import { OperatorSwitcher } from "./OperatorSwitcher";
import { UserCircle2 } from "lucide-react";
import logoTotalMaxx from "@/assets/totalmaxx-logo.png";

type Op = { id: string; full_name: string; username: string | null; has_pin: boolean };

/**
 * Após o login por Empresa, exige que um Usuário Interno seja selecionado
 * antes de liberar o app. Se não houver usuários cadastrados, libera.
 */
export function SessionUserGate({ children }: { children: ReactNode }) {
  const { session, effectiveOwnerId } = useAuth();
  const { activeOperator } = useOperator();
  const [dialogOpen, setDialogOpen] = useState(false);

  const list = useServerFn(listActiveOperatorsV2);
  const { data: operators = [], isLoading } = useQuery<Op[]>({
    queryKey: ["active-operators", "gate", effectiveOwnerId],
    queryFn: () => list() as Promise<Op[]>,
    enabled: !!session,
  });

  const needsSelection = !activeOperator && operators.length > 0;

  useEffect(() => {
    if (needsSelection) setDialogOpen(true);
  }, [needsSelection]);

  if (!session) return <>{children}</>;

  if (needsSelection) {
    return (
      <>
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
          <img
            src={logoTotalMaxx}
            alt="Total Maxx"
            className="max-h-20 w-auto object-contain mb-6"
          />
          <UserCircle2 className="h-10 w-10 text-muted-foreground mb-3" />
          <h1 className="text-2xl font-bold tracking-tight">Quem está usando?</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Escolha o seu usuário para continuar. Cada ação será registrada em seu nome.
          </p>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="mt-6 px-5 py-2.5 rounded-md bg-gradient-brand text-brand-foreground text-sm font-medium shadow-brand hover:opacity-95"
          >
            {isLoading ? "Carregando..." : "Selecionar usuário"}
          </button>
        </div>
        <OperatorSwitcher open={dialogOpen} onOpenChange={setDialogOpen} hideTrigger />
      </>
    );
  }

  return <>{children}</>;
}
