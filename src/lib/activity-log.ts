import { supabase } from "@/integrations/supabase/client";

export type ActivityInput = {
  action: string;
  description: string;
  entity?: string | null;
  entityId?: string | null;
  operatorId?: string | null;
  metadata?: Record<string, unknown>;
};

/** Rótulos amigáveis para os tipos de ação (usados nos filtros e na tela). */
export const ACTION_LABELS: Record<string, string> = {
  "budget.created": "Orçamento criado",
  "budget.updated": "Orçamento editado",
  "budget.deleted": "Orçamento excluído",
  "budget.approved": "Orçamento aprovado",
  "budget.converted": "Orçamento virou pedido",
  "order.updated": "Pedido atualizado",
  "order.deleted": "Pedido excluído",
  "discount.requested": "Desconto solicitado",
  "discount.approved": "Desconto aprovado",
  "discount.rejected": "Desconto recusado",
  "client.created": "Cliente criado",
  "client.updated": "Cliente editado",
  "client.deleted": "Cliente excluído",
  "client.imported": "Clientes importados",
  "product.created": "Produto criado",
  "product.updated": "Produto editado",
  "product.deleted": "Produto excluído",
  "product.imported": "Produtos importados",
  "carrier.created": "Transportadora criada",
  "carrier.updated": "Transportadora editada",
  "carrier.deleted": "Transportadora excluída",
  "architect.created": "Arquiteto criado",
  "architect.updated": "Arquiteto editado",
  "architect.deleted": "Arquiteto excluído",
  "supplier.created": "Fornecedor criado",
  "supplier.updated": "Fornecedor editado",
  "supplier.deleted": "Fornecedor excluído",
  "user.created": "Usuário criado",
  "user.updated": "Usuário editado",
  "user.deleted": "Usuário excluído",
  "user.pin_changed": "PIN alterado",
  "company.created": "Empresa criada",
  "company.updated": "Empresa editada",
};

export function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

/**
 * Grava um evento no Histórico do Sistema.
 * Nunca lança erro — histórico não pode quebrar o fluxo do usuário.
 */
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    await (supabase.rpc as any)("log_activity", {
      _action: input.action,
      _description: input.description,
      _entity: input.entity ?? null,
      _entity_id: input.entityId ?? null,
      _internal_user_id: input.operatorId ?? null,
      _metadata: input.metadata ?? {},
    });
  } catch {
    // silencioso
  }
}
