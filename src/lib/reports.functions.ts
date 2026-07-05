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

// ============================================================================
// Produtos & Fornecedores
// ============================================================================

type PartKey =
  | "perfil"
  | "perfilAdicional"
  | "paspatur"
  | "paspaturAdicional"
  | "foam"
  | "vidro"
  | "colagem"
  | "impressao";

interface PartExtract {
  productId: string;
  code: string;
  description: string;
  value: number;
}

function extractParts(item: Record<string, unknown>): PartExtract[] {
  const parts: PartExtract[] = [];
  const keys: { key: PartKey; idField: string; codeField: string; descField: string; valField: string }[] = [
    { key: "perfil", idField: "perfilId", codeField: "perfilCode", descField: "perfilDescription", valField: "valorPerfil" },
    { key: "perfilAdicional", idField: "perfilAdicionalId", codeField: "perfilAdicionalCode", descField: "perfilAdicionalDescription", valField: "valorPerfilAdicional" },
    { key: "paspatur", idField: "paspaturId", codeField: "paspaturCode", descField: "paspaturDescription", valField: "valorPaspatur" },
    { key: "paspaturAdicional", idField: "paspaturAdicionalId", codeField: "paspaturAdicionalCode", descField: "paspaturAdicionalDescription", valField: "valorPaspaturAdicional" },
    { key: "foam", idField: "foamId", codeField: "foamCode", descField: "foamDescription", valField: "valorFoam" },
    { key: "vidro", idField: "vidroId", codeField: "vidroCode", descField: "vidroDescription", valField: "valorVidro" },
    { key: "colagem", idField: "colagemId", codeField: "colagemCode", descField: "colagemDescription", valField: "valorColagem" },
    { key: "impressao", idField: "impressaoId", codeField: "impressaoCode", descField: "impressaoDescription", valField: "valorImpressao" },
  ];
  for (const k of keys) {
    const id = String(item[k.idField] ?? "").trim();
    const val = Number(item[k.valField]) || 0;
    if (!id || val <= 0) continue;
    parts.push({
      productId: id,
      code: String(item[k.codeField] ?? ""),
      description: String(item[k.descField] ?? ""),
      value: val,
    });
  }
  const diversos = Array.isArray(item.produtosDiversos)
    ? (item.produtosDiversos as Array<Record<string, unknown>>)
    : [];
  for (const d of diversos) {
    const id = String(d.productId ?? "").trim();
    const qty = Number(d.quantidade) || 1;
    const total = Number(d.total) || Number(d.valorUnitario) * qty || 0;
    if (!id) continue;
    // Represent quantities as multiple synthetic entries for aggregation of count.
    parts.push({
      productId: id,
      code: String(d.code ?? ""),
      description: String(d.nome ?? ""),
      value: total,
    });
  }
  return parts;
}

export const getProdutosFornecedoresReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: VendasFilters) => data)
  .handler(async ({ data, context }): Promise<ProdutosFornecedoresReport> => {
    const { supabase, userId } = context;

    const { data: adminRow } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    const isAdmin = adminRow === true;

    let client = supabase;
    if (isAdmin) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      client = supabaseAdmin as unknown as typeof supabase;
    }

    // 1. Fetch orders (respecting filters)
    let q = client
      .from("orders")
      .select(
        "id, budget_id, user_id, operator_id, created_at, status, budgets:budget_id(client_id)",
      )
      .order("created_at", { ascending: false })
      .limit(1000);

    const { from, to } = periodRange(data.period || "mes");
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lt("created_at", to);
    if (data.status && data.status !== "todos") q = q.eq("status", data.status);
    if (data.operatorId) q = q.eq("operator_id", data.operatorId);
    if (isAdmin && data.empresaUserId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: children } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("parent_user_id", data.empresaUserId);
      const ids = [data.empresaUserId, ...((children ?? []).map((c) => c.id))];
      q = q.in("user_id", ids);
    }

    const { data: orderRows, error: ordersErr } = await q;
    if (ordersErr) throw ordersErr;

    type OrderRow = {
      id: string;
      budget_id: string | null;
      budgets: { client_id: string | null } | null;
    };
    let orders = (orderRows ?? []) as unknown as OrderRow[];
    if (data.clientId) {
      orders = orders.filter((r) => r.budgets?.client_id === data.clientId);
    }

    const budgetIds = Array.from(
      new Set(orders.map((o) => o.budget_id).filter((v): v is string => !!v)),
    );

    if (budgetIds.length === 0) {
      return {
        totalValue: 0,
        totalQuantity: 0,
        totalOrders: 0,
        suppliers: [],
        products: [],
        topSupplier: null,
        topProduct: null,
        topCategory: null,
        topProductPerSupplier: {},
      };
    }

    // 2. Fetch budget items
    const { data: itemRows, error: itemsErr } = await client
      .from("budget_items")
      .select("id, budget_id, data")
      .in("budget_id", budgetIds);
    if (itemsErr) throw itemsErr;

    // 3. Fetch products for id -> supplier/category/description lookup
    const { data: prodRows } = await client
      .from("products")
      .select("id, code, description, category, supplier");
    const productMap = new Map<string, { code: string; description: string; category: string; supplier: string }>();
    for (const p of prodRows ?? []) {
      productMap.set(p.id, {
        code: p.code ?? "",
        description: p.description ?? "",
        category: (p.category ?? "").trim() || "—",
        supplier: (p.supplier ?? "").trim() || "—",
      });
    }

    // Map: which orderId each budget belongs to (a budget may map to multiple orders in theory; we count once per order)
    const budgetToOrders = new Map<string, string[]>();
    for (const o of orders) {
      if (!o.budget_id) continue;
      const arr = budgetToOrders.get(o.budget_id) ?? [];
      arr.push(o.id);
      budgetToOrders.set(o.budget_id, arr);
    }

    // 4. Aggregate per product and per supplier
    const productAgg = new Map<string, ProductRow & { orderSet: Set<string> }>();
    const supplierAgg = new Map<string, SupplierRow & { orderSet: Set<string> }>();
    const categoryAgg = new Map<string, { value: number; quantity: number }>();
    const supplierTopProduct = new Map<string, { name: string; quantity: number; value: number }>();

    for (const it of itemRows ?? []) {
      const parts = extractParts((it.data ?? {}) as Record<string, unknown>);
      const orderIds = budgetToOrders.get(it.budget_id) ?? [];
      if (orderIds.length === 0) continue;

      for (const part of parts) {
        const meta = productMap.get(part.productId);
        const supplier = meta?.supplier ?? "—";
        const category = meta?.category ?? "—";
        const code = meta?.code || part.code || "";
        const description = meta?.description || part.description || "Produto";

        // Filters
        if (data.supplier && data.supplier !== supplier) continue;
        if (data.category && data.category !== category) continue;
        if (data.productId && data.productId !== part.productId) continue;

        // per-product
        const pKey = part.productId;
        const pExisting = productAgg.get(pKey);
        if (pExisting) {
          pExisting.quantity += 1;
          pExisting.value += part.value;
          for (const oid of orderIds) pExisting.orderSet.add(oid);
        } else {
          productAgg.set(pKey, {
            productId: part.productId,
            name: description,
            code,
            category,
            supplier,
            quantity: 1,
            value: part.value,
            orders: 0,
            orderSet: new Set(orderIds),
          });
        }

        // per-supplier
        const sExisting = supplierAgg.get(supplier);
        if (sExisting) {
          sExisting.quantity += 1;
          sExisting.value += part.value;
          for (const oid of orderIds) sExisting.orderSet.add(oid);
        } else {
          supplierAgg.set(supplier, {
            supplier,
            quantity: 1,
            orders: 0,
            value: part.value,
            share: 0,
            orderSet: new Set(orderIds),
          });
        }

        // per-category
        const cExisting = categoryAgg.get(category);
        if (cExisting) {
          cExisting.value += part.value;
          cExisting.quantity += 1;
        } else {
          categoryAgg.set(category, { value: part.value, quantity: 1 });
        }

        // top product per supplier
        const currTop = supplierTopProduct.get(supplier);
        if (!currTop || part.value > currTop.value) {
          supplierTopProduct.set(supplier, {
            name: description,
            quantity: 1,
            value: part.value,
          });
        }
      }
    }

    const productsList: ProductRow[] = Array.from(productAgg.values())
      .map((p) => ({ ...p, orders: p.orderSet.size }))
      .sort((a, b) => b.value - a.value);

    const totalValue = Array.from(supplierAgg.values()).reduce((s, r) => s + r.value, 0);
    const totalQuantity = productsList.reduce((s, p) => s + p.quantity, 0);
    const totalOrders = new Set(orders.map((o) => o.id)).size;

    const suppliersList: SupplierRow[] = Array.from(supplierAgg.values())
      .map((s) => ({
        supplier: s.supplier,
        quantity: s.quantity,
        orders: s.orderSet.size,
        value: s.value,
        share: totalValue > 0 ? (s.value / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    const topSupplier = suppliersList[0] ?? null;
    const topProduct = productsList[0] ?? null;
    const topCategoryEntry = Array.from(categoryAgg.entries()).sort(
      (a, b) => b[1].value - a[1].value,
    )[0];
    const topCategory = topCategoryEntry
      ? { category: topCategoryEntry[0], ...topCategoryEntry[1] }
      : null;

    const topProductPerSupplier: Record<string, { name: string; quantity: number; value: number }> = {};
    for (const [s, v] of supplierTopProduct.entries()) topProductPerSupplier[s] = v;

    return {
      totalValue,
      totalQuantity,
      totalOrders,
      suppliers: suppliersList,
      products: productsList,
      topSupplier,
      topProduct,
      topCategory,
      topProductPerSupplier,
    };
  });
