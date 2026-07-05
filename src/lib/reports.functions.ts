import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface VendasFilters {
  period: string; // hoje|ontem|semana|mes|ano|todos
  status?: string; // "todos" or specific
  clientId?: string;
  operatorId?: string;
  empresaUserId?: string; // admin only
  category?: string;
  supplier?: string;
  productId?: string;
}

export interface VendasOrder {
  id: string;
  number: string;
  client_name: string;
  operator_name: string | null;
  created_at: string;
  status: string;
  total_value: number;
  discount_value: number;
  payment_method: string | null;
}

export interface VendasReport {
  summary: {
    faturamento: number;
    totalPedidos: number;
    ticketMedio: number;
    totalDescontos: number;
    valorRecebido: number;
  };
  orders: VendasOrder[];
}

export interface VendasOptions {
  isAdmin: boolean;
  clients: { id: string; name: string }[];
  operators: { id: string; name: string }[];
  empresas: { id: string; name: string }[];
  categories: string[];
  suppliers: string[];
  products: { id: string; label: string }[];
}

export interface SupplierRow {
  supplier: string;
  quantity: number;
  orders: number;
  value: number;
  share: number; // %
}
export interface ProductRow {
  productId: string | null;
  name: string;
  code: string;
  category: string;
  supplier: string;
  quantity: number;
  value: number;
  orders: number;
}

export interface ProdutosFornecedoresReport {
  totalValue: number;
  totalQuantity: number;
  totalOrders: number;
  suppliers: SupplierRow[];
  products: ProductRow[];
  topSupplier: SupplierRow | null;
  topProduct: ProductRow | null;
  topCategory: { category: string; value: number; quantity: number } | null;
  topProductPerSupplier: Record<string, { name: string; quantity: number; value: number }>;
}

function periodRange(period: string): { from?: string; to?: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === "hoje") {
    const f = startOfDay(now);
    return { from: f.toISOString() };
  }
  if (period === "ontem") {
    const f = startOfDay(new Date(now.getTime() - 86400000));
    const t = startOfDay(now);
    return { from: f.toISOString(), to: t.toISOString() };
  }
  if (period === "semana") {
    const f = startOfDay(new Date(now.getTime() - 7 * 86400000));
    return { from: f.toISOString() };
  }
  if (period === "mes") {
    const f = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: f.toISOString() };
  }
  if (period === "ano") {
    const f = new Date(now.getFullYear(), 0, 1);
    return { from: f.toISOString() };
  }
  return {};
}

export const getVendasOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VendasOptions> => {
    const { supabase, userId } = context;

    const { data: adminRow } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    const isAdmin = adminRow === true;

    let clientsQ = supabase.from("clients").select("id, name").order("name");
    let operatorsQ = supabase
      .from("operators")
      .select("id, name")
      .eq("active", true)
      .order("name");

    if (isAdmin) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      clientsQ = supabaseAdmin.from("clients").select("id, name").order("name");
      operatorsQ = supabaseAdmin
        .from("operators")
        .select("id, name")
        .eq("active", true)
        .order("name");
    }

    const [{ data: clients }, { data: operators }] = await Promise.all([
      clientsQ,
      operatorsQ,
    ]);

    let empresas: { id: string; name: string }[] = [];
    if (isAdmin) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Empresas = usuários com role 'revendedor' e sem parent (contas raiz).
      const { data: revRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "revendedor");
      const revIds = Array.from(new Set((revRoles ?? []).map((r) => r.user_id)));
      if (revIds.length) {
        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, store_name, parent_user_id")
          .in("id", revIds)
          .is("parent_user_id", null)
          .order("store_name", { nullsFirst: false });
        empresas = (profs ?? []).map((p) => ({
          id: p.id,
          name: p.store_name || p.full_name || "—",
        }));
      }
    }

    // Products/categories/suppliers for filter dropdowns.
    const prodClient = isAdmin
      ? (await import("@/integrations/supabase/client.server")).supabaseAdmin
      : supabase;
    const { data: prods } = await prodClient
      .from("products")
      .select("id, code, description, category, supplier")
      .order("description");
    const products = (prods ?? []).map((p) => ({
      id: p.id,
      label: `${p.code ? p.code + " - " : ""}${p.description ?? ""}`.trim(),
    }));
    const categories = Array.from(
      new Set((prods ?? []).map((p) => (p.category ?? "").trim()).filter(Boolean)),
    ).sort();
    const suppliers = Array.from(
      new Set((prods ?? []).map((p) => (p.supplier ?? "").trim()).filter(Boolean)),
    ).sort();

    return {
      isAdmin,
      clients: clients ?? [],
      operators: operators ?? [],
      empresas,
      categories,
      suppliers,
      products,
    };
  });

export const getVendasReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: VendasFilters) => data)
  .handler(async ({ data, context }): Promise<VendasReport> => {
    const { supabase, userId } = context;

    const { data: adminRow } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    const isAdmin = adminRow === true;

    // Admin needs cross-tenant read; otherwise RLS-scoped.
    let client = supabase;
    if (isAdmin) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      client = supabaseAdmin as unknown as typeof supabase;
    }

    let q = client
      .from("orders")
      .select(
        "id, number, client_name, operator_name, operator_id, created_at, status, total_value, budget_id, user_id, created_by, budgets:budget_id(details, client_id)",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    const { from, to } = periodRange(data.period || "mes");
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lt("created_at", to);
    if (data.status && data.status !== "todos") q = q.eq("status", data.status);
    if (data.operatorId) q = q.eq("operator_id", data.operatorId);
    if (isAdmin && data.empresaUserId) {
      // Inclui pedidos criados pela própria Empresa e por suas contas de acesso (filhos).
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: children } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("parent_user_id", data.empresaUserId);
      const ids = [data.empresaUserId, ...((children ?? []).map((c) => c.id))];
      q = q.in("user_id", ids);
    }

    const { data: rows, error } = await q;
    if (error) throw error;

    type Row = {
      id: string;
      number: string;
      client_name: string;
      operator_name: string | null;
      created_at: string;
      status: string;
      total_value: number | string;
      budget_id: string | null;
      budgets: { details: Record<string, unknown> | null; client_id: string | null } | null;
    };

    let filtered = (rows ?? []) as unknown as Row[];

    if (data.clientId) {
      filtered = filtered.filter((r) => r.budgets?.client_id === data.clientId);
    }

    const orders: VendasOrder[] = filtered.map((r) => {
      const details = (r.budgets?.details ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        number: r.number,
        client_name: r.client_name,
        operator_name: r.operator_name,
        created_at: r.created_at,
        status: r.status,
        total_value: Number(r.total_value) || 0,
        discount_value: Number(details.descontoValor) || 0,
        payment_method: (details.formaPagamento as string) || null,
      };
    });

    const faturamento = orders.reduce((s, o) => s + o.total_value, 0);
    const totalDescontos = orders.reduce((s, o) => s + o.discount_value, 0);
    const valorRecebido = filtered.reduce((s, r) => {
      const d = (r.budgets?.details ?? {}) as Record<string, unknown>;
      return s + (Number(d.valorSinal) || 0);
    }, 0);

    return {
      summary: {
        faturamento,
        totalPedidos: orders.length,
        ticketMedio: orders.length ? faturamento / orders.length : 0,
        totalDescontos,
        valorRecebido,
      },
      orders,
    };
  });
