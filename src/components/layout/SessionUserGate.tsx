import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { useOperator } from "@/hooks/useOperator";
import { listActiveOperatorsV2 } from "@/lib/operators.functions";
import { OperatorSwitcher } from "./OperatorSwitcher";
import { AlertTriangle } from "lucide-react";
import logoTotalMaxx from "@/assets/totalmaxx-logo.png";
import { Button } from "@/components/ui/button";


type Op = { id: string; full_name: string; username: string | null; has_pin: boolean };

/**
 * Após o login por Empresa, garante que um Usuário Interno esteja ativo:
 * - 0 usuários ativos: bloqueia com mensagem clara.
 * - 1 usuário ativo: auto-seleciona sem exigir PIN.
 * - 2+ usuários ativos: exige "Quem está usando?" + PIN.
 */
export function SessionUserGate({ children }: { children: ReactNode }) {
  const { session, effectiveOwnerId, signOut } = useAuth();
  const { activeOperator, setActiveOperator } = useOperator();
  const [dialogOpen, setDialogOpen] = useState(false);
  const autoSelectedRef = useRef<string | null>(null);

  const list = useServerFn(listActiveOperatorsV2);
  const { data: operators = [], isLoading } = useQuery<Op[]>({
    queryKey: ["active-operators", "gate", effectiveOwnerId],
    queryFn: () => list() as Promise<Op[]>,
    enabled: !!session,
  });

  // Auto-select when there is exactly 1 active user.
  useEffect(() => {
    if (!session || activeOperator) return;
    if (operators.length !== 1) return;
    const only = operators[0];
    if (autoSelectedRef.current === only.id) return;
    autoSelectedRef.current = only.id;
    setActiveOperator({
      id: only.id,
      full_name: only.full_name,
      username: only.username,
      permissions: {
        can_edit_budgets: true,
        can_create_products: true,
        can_create_clients: true,
        can_delete_orders: true,
        max_discount_percent: 100,
      },
    });
  }, [operators, session, activeOperator, setActiveOperator]);

  const needsSelection =
    !activeOperator && operators.length >= 2;

  useEffect(() => {
    if (needsSelection) setDialogOpen(true);
  }, [needsSelection]);

  if (!session) return <>{children}</>;

  // Empresa sem nenhum usuário ativo — bloqueia com orientação.
  if (!isLoading && operators.length === 0 && !activeOperator) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <img
          src={logoTotalMaxx}
          alt="Total Maxx"
          className="max-h-20 w-auto object-contain mb-6"
        />
        <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
        <h1 className="text-2xl font-bold tracking-tight">Nenhum usuário ativo</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          Esta empresa não possui usuários internos ativos. Peça ao proprietário
          ou ao Administrador Global para cadastrar ou reativar um usuário.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => signOut()}>
          Sair
        </Button>
      </div>
    );
  }

  if (needsSelection) {
    // Renderiza a app normalmente e sobrepõe o mesmo modal usado na troca
    // de usuário. Sem navegação para outra página.
    return (
      <>
        {children}
        <OperatorSwitcher open={dialogOpen} onOpenChange={setDialogOpen} hideTrigger />
      </>
    );
  }


  return <>{children}</>;
}
