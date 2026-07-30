/**
 * Modelo único de permissões dos usuários internos (operators).
 *
 * Regras gerais:
 * - Proprietário (is_owner) tem acesso irrestrito, sempre.
 * - Funcionário só acessa o que o proprietário liberar.
 * - "Permitir Cadastros" (can_manage_registrations) é o interruptor geral;
 *   cada cadastro liberado é controlado individualmente (reg_*).
 * - Cadastro de Usuários é exclusivo do proprietário e nunca é liberável.
 */

export interface OperatorPermissions {
  is_owner: boolean;
  can_access_reports: boolean;
  can_access_history: boolean;
  can_delete_orders: boolean;
  can_manage_registrations: boolean;
  reg_clients: boolean;
  reg_products: boolean;
  reg_suppliers: boolean;
  reg_architects: boolean;
  reg_carriers: boolean;
  max_discount_percent: number;
}

export type PermissionKey =
  | "reports"
  | "history"
  | "delete_orders"
  | "clients"
  | "products"
  | "suppliers"
  | "architects"
  | "carriers"
  | "users";

export const REGISTRATION_KEYS = [
  "clients",
  "products",
  "suppliers",
  "architects",
  "carriers",
] as const;

export type RegistrationKey = (typeof REGISTRATION_KEYS)[number];

export const REGISTRATION_LABELS: Record<RegistrationKey, string> = {
  clients: "Clientes",
  products: "Produtos",
  suppliers: "Fornecedores",
  architects: "Arquitetos",
  carriers: "Transportadoras",
};

export const REGISTRATION_FIELD: Record<RegistrationKey, keyof OperatorPermissions> = {
  clients: "reg_clients",
  products: "reg_products",
  suppliers: "reg_suppliers",
  architects: "reg_architects",
  carriers: "reg_carriers",
};

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  reports: "Relatórios",
  history: "Histórico do Sistema",
  delete_orders: "Excluir pedidos",
  clients: "Clientes",
  products: "Produtos",
  suppliers: "Fornecedores",
  architects: "Arquitetos",
  carriers: "Transportadoras",
  users: "Usuários",
};

export const OWNER_PERMISSIONS: OperatorPermissions = {
  is_owner: true,
  can_access_reports: true,
  can_access_history: true,
  can_delete_orders: true,
  can_manage_registrations: true,
  reg_clients: true,
  reg_products: true,
  reg_suppliers: true,
  reg_architects: true,
  reg_carriers: true,
  max_discount_percent: 100,
};

export const EMPTY_PERMISSIONS: OperatorPermissions = {
  is_owner: false,
  can_access_reports: false,
  can_access_history: false,
  can_delete_orders: false,
  can_manage_registrations: false,
  reg_clients: false,
  reg_products: false,
  reg_suppliers: false,
  reg_architects: false,
  reg_carriers: false,
  max_discount_percent: 0,
};

/** Normaliza uma linha da tabela `operators` para o modelo de permissões. */
export function toPermissions(row: Record<string, unknown> | null | undefined): OperatorPermissions {
  if (!row) return { ...EMPTY_PERMISSIONS };
  const isOwner = !!row.is_owner;
  if (isOwner) {
    return {
      ...OWNER_PERMISSIONS,
      max_discount_percent: 100,
    };
  }
  const manage = !!row.can_manage_registrations;
  return {
    is_owner: false,
    can_access_reports: !!row.can_access_reports,
    can_access_history: !!row.can_access_history,
    can_delete_orders: !!row.can_delete_orders,
    can_manage_registrations: manage,
    reg_clients: manage && !!row.reg_clients,
    reg_products: manage && !!row.reg_products,
    reg_suppliers: manage && !!row.reg_suppliers,
    reg_architects: manage && !!row.reg_architects,
    reg_carriers: manage && !!row.reg_carriers,
    max_discount_percent: Number(row.max_discount_percent ?? 0),
  };
}

/** Avalia uma permissão específica. Proprietário sempre passa. */
export function can(perms: OperatorPermissions | null | undefined, key: PermissionKey): boolean {
  if (!perms) return false;
  if (perms.is_owner) return true;
  switch (key) {
    case "reports":
      return perms.can_access_reports;
    case "history":
      return perms.can_access_history;
    case "delete_orders":
      return perms.can_delete_orders;
    case "users":
      return false; // exclusivo do proprietário
    default:
      return perms.can_manage_registrations && !!perms[REGISTRATION_FIELD[key]];
  }
}
