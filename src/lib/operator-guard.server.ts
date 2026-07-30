import { getRequest } from "@tanstack/react-start/server";
import { readOperatorToken } from "./operator-token.server";
import { can, toPermissions, type OperatorPermissions, type PermissionKey } from "./permissions";

export const OPERATOR_TOKEN_HEADER = "x-operator-token";

const OPERATOR_COLUMNS =
  "id, name, nickname, active, owner_user_id, is_owner, can_access_reports, can_access_history, can_delete_orders, can_manage_registrations, reg_clients, reg_products, reg_suppliers, reg_architects, reg_carriers, max_discount_percent";

/**
 * Lê o usuário interno ativo a partir do token assinado enviado pelo cliente.
 * Retorna null quando não há token válido.
 */
export async function currentOperator(): Promise<
  { id: string; name: string; ownerId: string; permissions: OperatorPermissions } | null
> {
  const request = getRequest();
  const raw = request?.headers?.get(OPERATOR_TOKEN_HEADER) ?? null;
  const parsed = readOperatorToken(raw);
  if (!parsed) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("operators")
    .select(OPERATOR_COLUMNS)
    .eq("id", parsed.operatorId)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row || !row.active || row.owner_user_id !== parsed.ownerId) return null;

  return {
    id: row.id as string,
    name: (row.name as string) ?? "Usuário",
    ownerId: row.owner_user_id as string,
    permissions: toPermissions(row),
  };
}

/**
 * Bloqueia a execução quando o usuário interno ativo não possui a permissão.
 * Proprietários passam sempre.
 */
export async function assertOperatorPermission(key: PermissionKey): Promise<void> {
  const op = await currentOperator();
  if (!op) {
    throw new Error("Selecione um usuário do sistema para continuar.");
  }
  if (!can(op.permissions, key)) {
    throw new Error("Você não possui permissão para esta ação.");
  }
}

/** Limite de desconto efetivo do usuário interno ativo. */
export async function operatorDiscountLimit(): Promise<number> {
  const op = await currentOperator();
  return op ? op.permissions.max_discount_percent : 0;
}
