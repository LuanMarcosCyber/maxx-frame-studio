import { useCallback } from "react";
import { useOperator } from "@/hooks/useOperator";
import { logActivity, type ActivityInput } from "@/lib/activity-log";

/** Registra ações no Histórico do Sistema já vinculadas ao usuário ativo. */
export function useActivityLog() {
  const { activeOperator } = useOperator();
  const operatorId = activeOperator?.id ?? null;

  return useCallback(
    (input: Omit<ActivityInput, "operatorId">) =>
      logActivity({ ...input, operatorId }),
    [operatorId],
  );
}
