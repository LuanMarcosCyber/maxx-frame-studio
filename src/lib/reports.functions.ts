import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildProductLookup } from "@/lib/reports-product-lookup.server";

export interface VendasFilters {
  period: string; // hoje|ontem|semana|mes|ano|todos
  status?: string; // "todos" or specific
  clientId?: string;
  operatorId?: string;
  empresaUserId?: string; // admin only
  category?: string;
  supplier?: string;
  productId?: string;
  dateFrom?: string; // yyyy-mm-dd (period === "personalizado")
  dateTo?: string; // yyyy-mm-dd (period === "personalizado")
  excludeTotalmaxx?: boolean; // "Todas (Sem TOTALMAXX)"
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
  budget_id: string | null;
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
  activeEmpresaId: string | null;
  categories: string[];
  suppliers: string[];
  products: { id: string; label: string }[];
  cities: string[];
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
  consumption: number; // meters or m²
  consumptionUnit: "m" | "m²" | "";
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
  supplierCategories: Record<string, string[]>;
  topProductsPerSupplier: Record<string, Array<{ name: string; quantity: number; value: number }>>;
  totalConsumptionLinearM: number;
  totalConsumptionAreaM2: number;
}



function periodRange(
  period: string,
  dateFrom?: string,
  dateTo?: string,
): { from?: string; to?: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === "personalizado") {
    const out: { from?: string; to?: string } = {};
    if (dateFrom) {
      const [y, m, d] = dateFrom.split("-").map(Number);
      if (y && m && d) out.from = new Date(y, m - 1, d).toISOString();
    }
    if (dateTo) {
      const [y, m, d] = dateTo.split("-").map(Number);
      // exclusive upper bound = day after the chosen end date
      if (y && m && d) out.to = new Date(y, m - 1, d + 1).toISOString();
    }
    return out;
  }
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

/** Resolve the range for a filter payload (handles "Personalizado"). */
function filterRange(data: { period?: string; dateFrom?: string; dateTo?: string }) {
  return periodRange(data.period || "mes", data.dateFrom, data.dateTo);
}

/** Root profile ids of the internal TOTALMAXX company (test data). */
async function totalmaxxRootIds(supabaseAdmin: any): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, store_name, full_name")
    .is("parent_user_id", null);
  return ((data ?? []) as Array<{ id: string; store_name: string | null; full_name: string | null }>)
    .filter((p) =>
      `${p.store_name ?? ""} ${p.full_name ?? ""}`.toLowerCase().replace(/\s+/g, "").includes("totalmaxx"),
    )
    .map((p) => p.id);
}

/**
 * Resolve the empresa filter scope for the current user.
 * - Admin: cross-tenant read; empresaUserId may be any root profile.
 * - Non-admin: only companies from list_switchable_companies (own + linked)
 *   are authorized. Manipulated ids are rejected server-side.
 * - excludeTotalmaxx: with no specific empresa, drops the internal TOTALMAXX
 *   company (and its users) from the scope.
 */
async function resolveEmpresaScope(
  context: { supabase: any; userId: string },
  empresaUserId: string | undefined,
  excludeTotalmaxx?: boolean,
): Promise<{ isAdmin: boolean; client: any; userIds: string[] | null; allowedRoots: string[] }> {
  const { supabase, userId } = context;
  const { data: adminRow } = await supabase.rpc("has_role", {
    _user_id: userId, _role: "admin",
  });
  const isAdmin = adminRow === true;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let allowedRoots: string[] = [];
  if (!isAdmin) {
    const { data: switchable } = await supabase.rpc("list_switchable_companies");
    allowedRoots = ((switchable ?? []) as Array<{ id: string }>).map((r) => r.id);
  }

  let userIds: string[] | null = null;
  if (empresaUserId) {
    if (!isAdmin && !allowedRoots.includes(empresaUserId)) {
      throw new Error("Empresa não autorizada.");
    }
    const { data: children } = await supabaseAdmin
      .from("profiles").select("id").eq("parent_user_id", empresaUserId);
    userIds = [empresaUserId, ...((children ?? []) as Array<{ id: string }>).map((c) => c.id)];
  } else if (excludeTotalmaxx) {
    const excluded = await totalmaxxRootIds(supabaseAdmin);
    if (excluded.length) {
      let roots: string[] = allowedRoots;
      if (isAdmin) {
        const { data: allRoots } = await supabaseAdmin
          .from("profiles").select("id").is("parent_user_id", null);
        roots = ((allRoots ?? []) as Array<{ id: string }>).map((r) => r.id);
      }
      roots = roots.filter((r) => !excluded.includes(r));
      const { data: children } = await supabaseAdmin
        .from("profiles").select("id")
        .in("parent_user_id", roots.length ? roots : ["00000000-0000-0000-0000-000000000000"]);
      userIds = [...roots, ...((children ?? []) as Array<{ id: string }>).map((c) => c.id)];
    } else if (!isAdmin && allowedRoots.length > 1) {
      const { data: children } = await supabaseAdmin
        .from("profiles").select("id").in("parent_user_id", allowedRoots);
      userIds = [...allowedRoots, ...((children ?? []) as Array<{ id: string }>).map((c) => c.id)];
    }
  } else if (!isAdmin && allowedRoots.length > 1) {
    const { data: children } = await supabaseAdmin
      .from("profiles").select("id").in("parent_user_id", allowedRoots);
    userIds = [...allowedRoots, ...((children ?? []) as Array<{ id: string }>).map((c) => c.id)];
  }


  const needsAdmin = isAdmin || userIds !== null;
  const client = needsAdmin ? (supabaseAdmin as any) : supabase;
  return { isAdmin, client, userIds, allowedRoots };
}



export const getVendasOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VendasOptions> => {
    await (await import("@/lib/operator-guard.server")).assertOperatorPermission("reports");
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

    // Nomes de clientes realmente usados em pedidos/orçamentos (mesmo sem cadastro)
    const docClient = isAdmin
      ? (await import("@/integrations/supabase/client.server")).supabaseAdmin
      : supabase;
    const [{ data: usedOrders }, { data: usedBudgets }] = await Promise.all([
      docClient.from("orders").select("client_name").limit(5000),
      docClient.from("budgets").select("client_name").limit(5000),
    ]);
    const registeredByName = new Map<string, { id: string; name: string }>();
    for (const c of (clients ?? []) as Array<{ id: string; name: string }>) {
      registeredByName.set(normName(c.name), c);
    }
    const extraNames = new Map<string, string>();
    for (const r of [...(usedOrders ?? []), ...(usedBudgets ?? [])] as Array<{
      client_name: string | null;
    }>) {
      const raw = (r.client_name ?? "").trim();
      if (!raw) continue;
      const key = normName(raw);
      if (registeredByName.has(key) || extraNames.has(key)) continue;
      extraNames.set(key, raw);
    }
    const clientOptions = [
      ...((clients ?? []) as Array<{ id: string; name: string }>),
      ...Array.from(extraNames.values()).map((name) => ({ id: `name:${name}`, name })),
    ].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    let empresas: { id: string; name: string }[] = [];
    let activeEmpresaId: string | null = null;
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
    } else {
      // Non-admin: only companies the caller may switch/consult (own + linked).
      // If only their own → filter hidden on the client.
      const { data: switchable } = await supabase.rpc("list_switchable_companies");
      const list = (switchable ?? []) as Array<{
        id: string; full_name: string | null; store_name: string | null; is_active: boolean;
      }>;
      empresas = list.map((r) => ({ id: r.id, name: r.store_name || r.full_name || "—" }));
      const active = list.find((r) => r.is_active);
      activeEmpresaId = active?.id ?? null;
    }


    // Products/categories/suppliers for filter dropdowns (catálogo próprio + global).
    const prodClient = isAdmin
      ? (await import("@/integrations/supabase/client.server")).supabaseAdmin
      : supabase;
    const lookup = await buildProductLookup(prodClient);
    const products = lookup.options;
    const categories = lookup.categories;
    const suppliers = lookup.supplierNames;

    const clientClient = isAdmin
      ? (await import("@/integrations/supabase/client.server")).supabaseAdmin
      : supabase;
    const { data: cityRows } = await clientClient.from("clients").select("city");
    const cities = Array.from(
      new Set(((cityRows ?? []) as Array<{ city: string | null }>).map((r) => (r.city ?? "").trim()).filter(Boolean)),
    ).sort();

    return {
      isAdmin,
      clients: clientOptions,
      operators: operators ?? [],
      empresas,
      activeEmpresaId,
      categories,
      suppliers,
      products,
      cities,
    };
  });


/** Normaliza nome de cliente para comparação (acentos/caixa/espaços). */
function normName(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/**
 * Resolve o filtro de cliente. O valor pode ser:
 *  - um uuid de cliente cadastrado → casa por client_id OU pelo nome cadastrado;
 *  - "name:<NOME>" → cliente digitado manualmente (sem cadastro), casa por nome.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
async function resolveClientFilter(
  client: any,
  clientId: string | undefined,
): Promise<{ id?: string; name?: string } | null> {
  if (!clientId) return null;
  if (clientId.startsWith("name:")) return { name: normName(clientId.slice(5)) };
  const { data } = await client.from("clients").select("name").eq("id", clientId).maybeSingle();
  return { id: clientId, name: data?.name ? normName(data.name) : undefined };
}

function matchesClient(
  f: { id?: string; name?: string } | null,
  row: { client_id?: string | null; client_name?: string | null },
): boolean {
  if (!f) return true;
  if (f.id && row.client_id && row.client_id === f.id) return true;
  if (f.name && normName(row.client_name) === f.name) return true;
  return false;
}

export const getVendasReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: VendasFilters) => data)
  .handler(async ({ data, context }): Promise<VendasReport> => {
    await (await import("@/lib/operator-guard.server")).assertOperatorPermission("reports");
    const { supabase } = context;
    const scope = await resolveEmpresaScope(context, data.empresaUserId, data.excludeTotalmaxx);
    const { isAdmin, client, userIds } = scope;

    let q = client
      .from("orders")
      .select(
        "id, number, client_name, operator_name, operator_id, created_at, status, total_value, budget_id, user_id, created_by, budgets:budget_id(details, client_id)",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    const { from, to } = filterRange(data);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lt("created_at", to);
    if (data.status && data.status !== "todos") q = q.eq("status", data.status);
    if (data.operatorId) q = q.eq("operator_id", data.operatorId);
    if (userIds) q = q.in("user_id", userIds);


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

    const clientFilter = await resolveClientFilter(client, data.clientId);
    if (clientFilter) {
      filtered = filtered.filter((r) =>
        matchesClient(clientFilter, {
          client_id: r.budgets?.client_id ?? null,
          client_name: r.client_name,
        }),
      );
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
        budget_id: r.budget_id ?? null,
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
  consumption: number; // per single item (already multiplied by item quantidade)
  consumptionUnit: "m" | "m²" | "";
}

function num(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function extractParts(item: Record<string, unknown>): PartExtract[] {
  const parts: PartExtract[] = [];
  const qtdItem = Math.max(1, Math.floor(num(item.quantidade) || 1));
  const aF = num(item.alturaFinal);
  const lF = num(item.larguraFinal);
  const areaMain = (aF * lF) / 10000; // m²
  const fwPrincipal = num(item.perfilFrameWidthCm);
  // Perfil = perímetro externo + 4× largura da moldura (sobra dos cortes 45°)
  const perimMain = aF > 0 && lF > 0 ? (2 * (aF + lF) + 4 * fwPrincipal) / 100 : 0;
  const aAdic = num(item.alturaAdicional);
  const lAdic = num(item.larguraAdicional);
  const areaAdic = (aAdic * lAdic) / 10000;
  const aPerfilAdic = num(item.alturaPerfilAdicional);
  const lPerfilAdic = num(item.larguraPerfilAdicional);
  const fwAdic = num(item.perfilAdicionalFrameWidthCm);
  const perimPerfilAdic =
    aPerfilAdic > 0 && lPerfilAdic > 0
      ? (2 * (aPerfilAdic + lPerfilAdic) + 4 * fwAdic) / 100
      : 0;
  const vidroQtd = Math.max(1, Math.floor(num(item.vidroQuantidade) || 1));

  const keys: {
    key: PartKey;
    idField: string;
    codeField: string;
    descField: string;
    valField: string;
    consumption: number;
    unit: "m" | "m²" | "";
  }[] = [
    { key: "perfil", idField: "perfilId", codeField: "perfilCode", descField: "perfilDescription", valField: "valorPerfil", consumption: perimMain, unit: "m" },
    { key: "perfilAdicional", idField: "perfilAdicionalId", codeField: "perfilAdicionalCode", descField: "perfilAdicionalDescription", valField: "valorPerfilAdicional", consumption: perimPerfilAdic, unit: "m" },
    { key: "paspatur", idField: "paspaturId", codeField: "paspaturCode", descField: "paspaturDescription", valField: "valorPaspatur", consumption: areaMain, unit: "m²" },
    { key: "paspaturAdicional", idField: "paspaturAdicionalId", codeField: "paspaturAdicionalCode", descField: "paspaturAdicionalDescription", valField: "valorPaspaturAdicional", consumption: areaAdic, unit: "m²" },
    { key: "foam", idField: "foamId", codeField: "foamCode", descField: "foamDescription", valField: "valorFoam", consumption: areaMain, unit: "m²" },
    { key: "vidro", idField: "vidroId", codeField: "vidroCode", descField: "vidroDescription", valField: "valorVidro", consumption: areaMain * vidroQtd, unit: "m²" },
    { key: "colagem", idField: "colagemId", codeField: "colagemCode", descField: "colagemDescription", valField: "valorColagem", consumption: 0, unit: "" },
    { key: "impressao", idField: "impressaoId", codeField: "impressaoCode", descField: "impressaoDescription", valField: "valorImpressao", consumption: areaMain, unit: "m²" },
  ];
  for (const k of keys) {
    const id = String(item[k.idField] ?? "").trim();
    const val = num(item[k.valField]);
    if (!id) continue;
    parts.push({
      productId: id,
      code: String(item[k.codeField] ?? ""),
      description: String(item[k.descField] ?? ""),
      value: val,
      consumption: k.consumption * qtdItem,
      consumptionUnit: k.unit,
    });
  }
  const diversos = Array.isArray(item.produtosDiversos)
    ? (item.produtosDiversos as Array<Record<string, unknown>>)
    : [];
  for (const d of diversos) {
    const id = String(d.productId ?? "").trim();
    const qty = num(d.quantidade) || 1;
    const total = num(d.total) || num(d.valorUnitario) * qty || 0;
    if (!id) continue;
    parts.push({
      productId: id,
      code: String(d.code ?? ""),
      description: String(d.nome ?? ""),
      value: total,
      consumption: 0,
      consumptionUnit: "",
    });
  }
  return parts;
}


export const getProdutosFornecedoresReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: VendasFilters) => data)
  .handler(async ({ data, context }): Promise<ProdutosFornecedoresReport> => {
    await (await import("@/lib/operator-guard.server")).assertOperatorPermission("reports");
    const scope = await resolveEmpresaScope(context, data.empresaUserId, data.excludeTotalmaxx);
    const { client, userIds } = scope;

    // 1. Fetch orders (respecting filters)
    let q = client
      .from("orders")
      .select(
        "id, budget_id, user_id, operator_id, created_at, status, budgets:budget_id(client_id)",
      )
      .order("created_at", { ascending: false })
      .limit(1000);

    const { from, to } = filterRange(data);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lt("created_at", to);
    if (data.status && data.status !== "todos") q = q.eq("status", data.status);
    if (data.operatorId) q = q.eq("operator_id", data.operatorId);
    if (userIds) q = q.in("user_id", userIds);


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
        supplierCategories: {},
        topProductsPerSupplier: {},
        totalConsumptionLinearM: 0,
        totalConsumptionAreaM2: 0,
      };

    }

    // 2. Fetch budget items
    const { data: itemRows, error: itemsErr } = await client
      .from("budget_items")
      .select("id, budget_id, data")
      .in("budget_id", budgetIds);
    if (itemsErr) throw itemsErr;

    // 3. Lookup unificado id -> supplier/category/description (próprios + globais)
    const productMap = (await buildProductLookup(client)).map;

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
    const supplierCategoriesSet = new Map<string, Set<string>>();
    const supplierProductAgg = new Map<string, Map<string, { name: string; quantity: number; value: number }>>();

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
        // Consumo final = consumo base da categoria × (1 + perda %) — a perda é
        // sempre o último passo, aplicada só no relatório (não altera pedidos/preços).
        const wastePct = Number(meta?.wastePct) || 0;
        const finalConsumption = part.consumption * (1 + wastePct / 100);

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
          pExisting.consumption += finalConsumption;
          if (!pExisting.consumptionUnit && part.consumptionUnit) {
            pExisting.consumptionUnit = part.consumptionUnit;
          }
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
            consumption: finalConsumption,
            consumptionUnit: part.consumptionUnit,
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

        // categories per supplier
        let cats = supplierCategoriesSet.get(supplier);
        if (!cats) { cats = new Set(); supplierCategoriesSet.set(supplier, cats); }
        if (category) cats.add(category);

        // products per supplier
        let spMap = supplierProductAgg.get(supplier);
        if (!spMap) { spMap = new Map(); supplierProductAgg.set(supplier, spMap); }
        const spKey = part.productId;
        const spExisting = spMap.get(spKey);
        if (spExisting) {
          spExisting.quantity += 1;
          spExisting.value += part.value;
        } else {
          spMap.set(spKey, { name: description, quantity: 1, value: part.value });
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
    const topProductsPerSupplier: Record<string, Array<{ name: string; quantity: number; value: number }>> = {};
    for (const [s, m] of supplierProductAgg.entries()) {
      const arr = Array.from(m.values()).sort((a, b) => b.value - a.value);
      topProductsPerSupplier[s] = arr.slice(0, 5);
      if (arr[0]) topProductPerSupplier[s] = arr[0];
    }
    const supplierCategories: Record<string, string[]> = {};
    for (const [s, set] of supplierCategoriesSet.entries()) {
      supplierCategories[s] = Array.from(set).sort();
    }

    let totalConsumptionLinearM = 0;
    let totalConsumptionAreaM2 = 0;
    for (const p of productsList) {
      if (p.consumptionUnit === "m") totalConsumptionLinearM += p.consumption;
      else if (p.consumptionUnit === "m²") totalConsumptionAreaM2 += p.consumption;
    }

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
      supplierCategories,
      topProductsPerSupplier,
      totalConsumptionLinearM,
      totalConsumptionAreaM2,
    };

  });

// ============================================================================
// Orçamentos
// ============================================================================

export interface OrcamentoRow {
  id: string;
  number: string;
  client_name: string;
  operator_name: string | null;
  user_id: string;
  empresa_name: string | null;
  status: string;
  total_value: number;
  created_at: string;
  approved_at: string | null;
  has_order: boolean;
}

export interface OrcamentosReport {
  summary: {
    total: number;
    valorTotal: number;
    ticketMedio: number;
    maior: number;
    menor: number;
  };
  funnel: {
    criados: { qtd: number; valor: number };
    pendentes: { qtd: number; valor: number };
    aprovados: { qtd: number; valor: number };
    transformados: { qtd: number; valor: number };
  };
  ranking: { id: string; number: string; client_name: string; value: number; status: string }[];
  rows: OrcamentoRow[];
}

function bucketKey(iso: string, granularity: string): string {
  const d = new Date(iso);
  if (granularity === "dia") return d.toISOString().slice(0, 10);
  if (granularity === "semana") {
    const day = d.getUTCDay();
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
    return monday.toISOString().slice(0, 10);
  }
  if (granularity === "ano") return String(d.getUTCFullYear());
  // mes
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isAprovadoStatus(s: string): boolean {
  const v = (s || "").toLowerCase();
  return (
    v === "aprovado" ||
    v === "em produção" ||
    v === "em producao" ||
    v === "finalizado" ||
    v === "entregue" ||
    v === "aguardando pagamento"
  );
}
function isPendenteStatus(s: string): boolean {
  const v = (s || "").toLowerCase();
  return v === "aguardando" || v === "pendente" || v === "";
}
function isCanceladoStatus(s: string): boolean {
  return (s || "").toLowerCase() === "cancelado";
}

export interface OrcamentosFilters extends VendasFilters {
  granularity?: string; // dia|semana|mes|ano
}

export const getOrcamentosReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: OrcamentosFilters) => data)
  .handler(async ({ data, context }): Promise<OrcamentosReport> => {
    await (await import("@/lib/operator-guard.server")).assertOperatorPermission("reports");
    const scope = await resolveEmpresaScope(context, data.empresaUserId, data.excludeTotalmaxx);
    const { isAdmin, client, userIds } = scope;

    let q = client
      .from("budgets")
      .select(
        "id, number, client_name, client_id, operator_name, operator_id, user_id, status, total_value, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(1000);

    const { from, to } = filterRange(data);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lt("created_at", to);
    if (data.status && data.status !== "todos") q = q.eq("status", data.status);
    if (data.operatorId) q = q.eq("operator_id", data.operatorId);
    const clientFilter = await resolveClientFilter(client, data.clientId);
    if (userIds) q = q.in("user_id", userIds);


    const { data: budgets, error } = await q;
    if (error) throw error;

    const listAll = (budgets ?? []) as Array<{
      id: string;
      number: string;
      client_name: string;
      client_id: string | null;
      operator_name: string | null;
      operator_id: string | null;
      user_id: string;
      status: string;
      total_value: number | string;
      created_at: string;
      updated_at: string;
    }>;
    const list = clientFilter
      ? listAll.filter((b) => matchesClient(clientFilter, b))
      : listAll;

    // Companies map (admin)
    let empresaMap = new Map<string, string>();
    if (isAdmin && list.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const uids = Array.from(new Set(list.map((b) => b.user_id)));
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, store_name, full_name, parent_user_id")
        .in("id", uids);
      for (const p of profs ?? []) {
        empresaMap.set(p.id, p.store_name || p.full_name || "—");
      }
    }

    // Orders referencing these budgets
    const budgetIds = list.map((b) => b.id);
    let orderMap = new Map<string, string>(); // budget_id -> order created_at
    if (budgetIds.length) {
      const { data: ords } = await client
        .from("orders")
        .select("budget_id, created_at")
        .in("budget_id", budgetIds);
      for (const o of ords ?? []) {
        if (o.budget_id && !orderMap.has(o.budget_id)) orderMap.set(o.budget_id, o.created_at);
      }
    }

    const allRows: OrcamentoRow[] = list.map((b) => {
      const v = Number(b.total_value) || 0;
      const aprovado = isAprovadoStatus(b.status);
      return {
        id: b.id,
        number: b.number,
        client_name: b.client_name,
        operator_name: b.operator_name,
        user_id: b.user_id,
        empresa_name: empresaMap.get(b.user_id) ?? null,
        status: b.status,
        total_value: v,
        created_at: b.created_at,
        approved_at: aprovado ? b.updated_at : null,
        has_order: orderMap.has(b.id),
      };
    });

    // Relatório de Orçamentos = apenas oportunidades em aberto (pendentes,
    // ainda não aprovadas e não convertidas em pedido).
    const rows = allRows.filter(
      (r) => !r.has_order && !isAprovadoStatus(r.status) && !isCanceladoStatus(r.status),
    );

    const total = rows.length;
    const valorTotal = rows.reduce((s, r) => s + r.total_value, 0);
    const values = rows.map((r) => r.total_value).filter((v) => v > 0);
    const maior = values.length ? Math.max(...values) : 0;
    const menor = values.length ? Math.min(...values) : 0;
    const ticketMedio = total ? valorTotal / total : 0;
    // Funil comercial: continua considerando todos os orçamentos do período
    const aprovadosArr = allRows.filter((r) => isAprovadoStatus(r.status));
    const pendentesArr = allRows.filter((r) => isPendenteStatus(r.status));
    const transformadosArr = allRows.filter((r) => r.has_order);

    const ranking = [...rows]
      .sort((a, b) => b.total_value - a.total_value)
      .slice(0, 10)
      .map((r) => ({
        id: r.id,
        number: r.number,
        client_name: r.client_name,
        value: r.total_value,
        status: r.status,
      }));

    return {
      summary: {
        total,
        valorTotal,
        ticketMedio,
        maior,
        menor,
      },
      funnel: {
        criados: { qtd: allRows.length, valor: allRows.reduce((s, r) => s + r.total_value, 0) },
        pendentes: {
          qtd: pendentesArr.length,
          valor: pendentesArr.reduce((s, r) => s + r.total_value, 0),
        },
        aprovados: {
          qtd: aprovadosArr.length,
          valor: aprovadosArr.reduce((s, r) => s + r.total_value, 0),
        },
        transformados: {
          qtd: transformadosArr.length,
          valor: transformadosArr.reduce((s, r) => s + r.total_value, 0),
        },
      },
      ranking,
      rows,
    };

  });

// ============================================================================
// Clientes
// ============================================================================

export interface ClienteRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  qtdPedidos: number;
  qtdOrcamentos: number;
  valorComprado: number;
  ultimaCompra: string | null;
  ticketMedio: number;
  createdAt: string;
}

export interface ClientesFilters extends VendasFilters {
  cityFilter?: string;
  inactivityDays?: number; // default 90
}

export interface ClientesReport {
  summary: {
    totalClientes: number;
    ativos: number;
    inativos: number;
    novosNoPeriodo: number;
    ticketMedio: number;
    valorTotal: number;
  };
  topFaturamento: ClienteRow[];
  topPedidos: ClienteRow[];
  topOrcamentos: ClienteRow[];
  semComprar: ClienteRow[];
  recorrentes: ClienteRow[];
  novos: ClienteRow[];
  maisCresceram: ClienteRow[];
  rows: ClienteRow[];
  cities: string[];
  inactivityDays: number;
}

export const getClientesReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ClientesFilters) => data)
  .handler(async ({ data, context }): Promise<ClientesReport> => {
    await (await import("@/lib/operator-guard.server")).assertOperatorPermission("reports");
    const scope = await resolveEmpresaScope(context, data.empresaUserId, data.excludeTotalmaxx);
    const { client, userIds } = scope;


    // Clients (all cadastrados)
    let cq = client
      .from("clients")
      .select("id, name, city, state, created_at, user_id")
      .order("name")
      .limit(5000);
    if (userIds) cq = cq.in("user_id", userIds);
    const { data: clientsData, error: cErr } = await cq;
    if (cErr) throw cErr;

    // Orders (todos, para calcular pedidos por cliente — sempre em janela ampla)
    let oq = client
      .from("orders")
      .select("id, client_name, total_value, created_at, operator_id, user_id, budget_id, budgets:budget_id(client_id)")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (userIds) oq = oq.in("user_id", userIds);
    if (data.operatorId) oq = oq.eq("operator_id", data.operatorId);
    const { data: ordersData, error: oErr } = await oq;
    if (oErr) throw oErr;

    // Budgets
    let bq = client
      .from("budgets")
      .select("id, client_id, total_value, created_at, operator_id, user_id")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (userIds) bq = bq.in("user_id", userIds);
    if (data.operatorId) bq = bq.eq("operator_id", data.operatorId);
    const { data: budgetsData, error: bErr } = await bq;
    if (bErr) throw bErr;

    const { from, to } = filterRange(data);
    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() : null;
    const inRange = (iso: string) => {
      const t = new Date(iso).getTime();
      if (fromTs !== null && t < fromTs) return false;
      if (toTs !== null && t >= toTs) return false;
      return true;
    };

    const clientsList = (clientsData ?? []) as Array<{
      id: string;
      name: string;
      city: string | null;
      state: string | null;
      created_at: string;
      user_id: string;
    }>;
    const orders = (ordersData ?? []) as Array<{
      id: string;
      client_name: string;
      total_value: number | string;
      created_at: string;
      budgets: { client_id: string | null } | null;
    }>;
    const budgets = (budgetsData ?? []) as Array<{
      id: string;
      client_id: string | null;
      total_value: number | string;
      created_at: string;
    }>;

    const cityFilter = (data.cityFilter && data.cityFilter !== "todos") ? data.cityFilter : null;

    // Aggregate per client
    type Agg = {
      qtdPedidos: number;
      qtdOrcamentos: number;
      valorComprado: number;
      ultimaCompra: string | null;
      valorAnterior: number; // for growth
      valorPeriodo: number;
    };
    const agg = new Map<string, Agg>();
    const ensure = (id: string): Agg => {
      let a = agg.get(id);
      if (!a) {
        a = { qtdPedidos: 0, qtdOrcamentos: 0, valorComprado: 0, ultimaCompra: null, valorAnterior: 0, valorPeriodo: 0 };
        agg.set(id, a);
      }
      return a;
    };

    for (const o of orders) {
      const cid = o.budgets?.client_id;
      if (!cid) continue;
      if (data.clientId && data.clientId !== cid) continue;
      const a = ensure(cid);
      const v = Number(o.total_value) || 0;
      a.qtdPedidos += 1;
      a.valorComprado += v;
      if (!a.ultimaCompra || o.created_at > a.ultimaCompra) a.ultimaCompra = o.created_at;
      if (inRange(o.created_at)) a.valorPeriodo += v;
      else if (fromTs !== null) {
        // previous window of same length
        const t = new Date(o.created_at).getTime();
        const windowSize = (toTs ?? Date.now()) - fromTs;
        if (t >= fromTs - windowSize && t < fromTs) a.valorAnterior += v;
      }
    }
    for (const b of budgets) {
      if (!b.client_id) continue;
      if (data.clientId && data.clientId !== b.client_id) continue;
      const a = ensure(b.client_id);
      a.qtdOrcamentos += 1;
    }

    // Build rows
    const clientMap = new Map(clientsList.map((c) => [c.id, c]));
    const now = Date.now();
    const inactivityDays = data.inactivityDays ?? 90;

    let rows: ClienteRow[] = clientsList
      .filter((c) => !cityFilter || (c.city ?? "") === cityFilter)
      .filter((c) => !data.clientId || c.id === data.clientId)
      .map((c) => {
        const a = agg.get(c.id) ?? {
          qtdPedidos: 0,
          qtdOrcamentos: 0,
          valorComprado: 0,
          ultimaCompra: null,
          valorAnterior: 0,
          valorPeriodo: 0,
        };
        return {
          id: c.id,
          name: c.name,
          city: c.city,
          state: c.state,
          qtdPedidos: a.qtdPedidos,
          qtdOrcamentos: a.qtdOrcamentos,
          valorComprado: a.valorComprado,
          ultimaCompra: a.ultimaCompra,
          ticketMedio: a.qtdPedidos ? a.valorComprado / a.qtdPedidos : 0,
          createdAt: c.created_at,
        };
      });

    const totalClientes = rows.length;
    const ativos = rows.filter(
      (r) => r.ultimaCompra && (now - new Date(r.ultimaCompra).getTime()) / 86400000 <= inactivityDays,
    ).length;
    const inativos = totalClientes - ativos;
    const novosNoPeriodo = rows.filter((r) => inRange(r.createdAt)).length;
    const valorTotal = rows.reduce((s, r) => s + r.valorComprado, 0);
    const totalPedidos = rows.reduce((s, r) => s + r.qtdPedidos, 0);
    const ticketMedio = totalPedidos ? valorTotal / totalPedidos : 0;

    const topFaturamento = [...rows].sort((a, b) => b.valorComprado - a.valorComprado).slice(0, 10);
    const topPedidos = [...rows].sort((a, b) => b.qtdPedidos - a.qtdPedidos).slice(0, 10);
    const topOrcamentos = [...rows].sort((a, b) => b.qtdOrcamentos - a.qtdOrcamentos).slice(0, 10);

    const semComprar = rows
      .filter(
        (r) =>
          !r.ultimaCompra ||
          (now - new Date(r.ultimaCompra).getTime()) / 86400000 > inactivityDays,
      )
      .sort((a, b) => {
        const ta = a.ultimaCompra ? new Date(a.ultimaCompra).getTime() : 0;
        const tb = b.ultimaCompra ? new Date(b.ultimaCompra).getTime() : 0;
        return ta - tb;
      })
      .slice(0, 10);

    const recorrentes = rows.filter((r) => r.qtdPedidos > 1).sort((a, b) => b.qtdPedidos - a.qtdPedidos).slice(0, 10);
    const novos = rows.filter((r) => inRange(r.createdAt)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 10);

    // Cresceram: comparação valorPeriodo vs valorAnterior
    const growthList = clientsList
      .map((c) => {
        const a = agg.get(c.id);
        if (!a) return null;
        const growth = a.valorPeriodo - a.valorAnterior;
        return { id: c.id, growth, atual: a.valorPeriodo, anterior: a.valorAnterior };
      })
      .filter((x): x is { id: string; growth: number; atual: number; anterior: number } => x !== null && x.growth > 0)
      .sort((a, b) => b.growth - a.growth)
      .slice(0, 10);
    const rowIndex = new Map(rows.map((r) => [r.id, r]));
    const maisCresceram = growthList
      .map((g) => rowIndex.get(g.id))
      .filter((r): r is ClienteRow => !!r);

    const cities = Array.from(
      new Set(clientsList.map((c) => (c.city ?? "").trim()).filter(Boolean)),
    ).sort();

    return {
      summary: {
        totalClientes,
        ativos,
        inativos,
        novosNoPeriodo,
        ticketMedio,
        valorTotal,
      },
      topFaturamento,
      topPedidos,
      topOrcamentos,
      semComprar,
      recorrentes,
      novos,
      maisCresceram,
      rows: rows.sort((a, b) => b.valorComprado - a.valorComprado),
      cities,
      inactivityDays,
    };
  });

// ============================================================================
// Colaboradores
// ============================================================================

export interface ColaboradorRow {
  id: string; // operator_id or synthetic name-based key
  name: string;
  empresa_name: string | null;
  orcamentos: number;
  pedidos: number;
  conversao: number; // %
  valorVendido: number;
  ticketMedio: number;
  descontoMedio: number;
}

export interface ColaboradoresReport {
  summary: {
    totalColaboradores: number;
    orcamentos: number;
    pedidos: number;
    valorVendido: number;
    ticketMedio: number;
  };
  maiorVendedor: ColaboradorRow | null;
  maiorOrcamentos: ColaboradorRow | null;
  maiorPedidos: ColaboradorRow | null;
  maiorFaturamento: ColaboradorRow | null;
  maiorConversao: ColaboradorRow | null;
  maiorTicket: ColaboradorRow | null;
  maisDescontos: ColaboradorRow | null;
  rows: ColaboradorRow[];
}

export const getColaboradoresReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: VendasFilters) => data)
  .handler(async ({ data, context }): Promise<ColaboradoresReport> => {
    await (await import("@/lib/operator-guard.server")).assertOperatorPermission("reports");
    const scope = await resolveEmpresaScope(context, data.empresaUserId, data.excludeTotalmaxx);
    const { client, userIds } = scope;


    const { from, to } = filterRange(data);

    // Budgets
    let bq = client
      .from("budgets")
      .select("id, operator_id, operator_name, user_id, total_value, created_at, details")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (from) bq = bq.gte("created_at", from);
    if (to) bq = bq.lt("created_at", to);
    if (userIds) bq = bq.in("user_id", userIds);
    if (data.operatorId) bq = bq.eq("operator_id", data.operatorId);
    if (data.clientId) bq = bq.eq("client_id", data.clientId);
    const { data: budgetsData, error: bErr } = await bq;
    if (bErr) throw bErr;

    // Orders
    let oq = client
      .from("orders")
      .select("id, operator_id, operator_name, user_id, total_value, created_at, budget_id, budgets:budget_id(details, client_id)")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (from) oq = oq.gte("created_at", from);
    if (to) oq = oq.lt("created_at", to);
    if (userIds) oq = oq.in("user_id", userIds);
    if (data.operatorId) oq = oq.eq("operator_id", data.operatorId);
    const { data: ordersData, error: oErr } = await oq;
    if (oErr) throw oErr;

    const budgets = (budgetsData ?? []) as Array<{
      id: string;
      operator_id: string | null;
      operator_name: string | null;
      user_id: string;
      total_value: number | string;
      created_at: string;
      details: Record<string, unknown> | null;
    }>;
    const orders = (ordersData ?? []) as Array<{
      id: string;
      operator_id: string | null;
      operator_name: string | null;
      user_id: string;
      total_value: number | string;
      budget_id: string | null;
      budgets: { details: Record<string, unknown> | null; client_id: string | null } | null;
    }>;

    // Empresa names (admin)
    const empresaMap = new Map<string, string>();
    if (scope.isAdmin) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const uids = Array.from(new Set([
        ...budgets.map((b) => b.user_id),
        ...orders.map((o) => o.user_id),
      ]));
      if (uids.length) {
        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("id, store_name, full_name")
          .in("id", uids);
        for (const p of profs ?? []) {
          empresaMap.set(p.id, p.store_name || p.full_name || "—");
        }
      }
    }

    type Agg = {
      id: string;
      name: string;
      empresa_name: string | null;
      orcamentos: number;
      pedidos: number;
      valorVendido: number;
      descontoTotal: number;
      descontoCount: number;
    };
    const agg = new Map<string, Agg>();
    const keyOf = (opId: string | null, opName: string | null) =>
      opId ? `id:${opId}` : `name:${(opName ?? "—").trim().toLowerCase()}`;
    const ensure = (opId: string | null, opName: string | null, empresa: string | null): Agg => {
      const k = keyOf(opId, opName);
      let a = agg.get(k);
      if (!a) {
        a = {
          id: opId ?? k,
          name: (opName ?? "—") || "—",
          empresa_name: empresa,
          orcamentos: 0,
          pedidos: 0,
          valorVendido: 0,
          descontoTotal: 0,
          descontoCount: 0,
        };
        agg.set(k, a);
      }
      if (!a.empresa_name && empresa) a.empresa_name = empresa;
      return a;
    };

    for (const b of budgets) {
      if (data.clientId) {
        // filter would need details; keep simple — server already filtered by client_id
      }
      const empresa = empresaMap.get(b.user_id) ?? null;
      const a = ensure(b.operator_id, b.operator_name, empresa);
      a.orcamentos += 1;
    }

    for (const o of orders) {
      if (data.clientId && o.budgets?.client_id !== data.clientId) continue;
      const empresa = empresaMap.get(o.user_id) ?? null;
      const a = ensure(o.operator_id, o.operator_name, empresa);
      const v = Number(o.total_value) || 0;
      a.pedidos += 1;
      a.valorVendido += v;
      const details = o.budgets?.details ?? {};
      const desc = Number((details as Record<string, unknown>).descontoValor) || 0;
      if (desc > 0) {
        a.descontoTotal += desc;
        a.descontoCount += 1;
      }
    }

    const rows: ColaboradorRow[] = Array.from(agg.values()).map((a) => ({
      id: a.id,
      name: a.name,
      empresa_name: a.empresa_name,
      orcamentos: a.orcamentos,
      pedidos: a.pedidos,
      conversao: a.orcamentos > 0 ? (a.pedidos / a.orcamentos) * 100 : 0,
      valorVendido: a.valorVendido,
      ticketMedio: a.pedidos > 0 ? a.valorVendido / a.pedidos : 0,
      descontoMedio: a.descontoCount > 0 ? a.descontoTotal / a.descontoCount : 0,
    }));

    const totalColaboradores = rows.length;
    const orcTotal = rows.reduce((s, r) => s + r.orcamentos, 0);
    const pedTotal = rows.reduce((s, r) => s + r.pedidos, 0);
    const valTotal = rows.reduce((s, r) => s + r.valorVendido, 0);
    const ticketMedio = pedTotal ? valTotal / pedTotal : 0;

    const bestBy = (fn: (r: ColaboradorRow) => number): ColaboradorRow | null => {
      let best: ColaboradorRow | null = null;
      let bv = -Infinity;
      for (const r of rows) {
        const v = fn(r);
        if (v > bv) { bv = v; best = r; }
      }
      return best && bv > 0 ? best : null;
    };

    return {
      summary: {
        totalColaboradores,
        orcamentos: orcTotal,
        pedidos: pedTotal,
        valorVendido: valTotal,
        ticketMedio,
      },
      maiorVendedor: bestBy((r) => r.valorVendido),
      maiorOrcamentos: bestBy((r) => r.orcamentos),
      maiorPedidos: bestBy((r) => r.pedidos),
      maiorFaturamento: bestBy((r) => r.valorVendido),
      maiorConversao: bestBy((r) => r.conversao),
      maiorTicket: bestBy((r) => r.ticketMedio),
      maisDescontos: bestBy((r) => r.descontoMedio),
      rows: rows.sort((a, b) => b.valorVendido - a.valorVendido),
    };
  });

// ============================================================================
// Empresas (admin-only)
// ============================================================================

export interface EmpresaRow {
  id: string;
  name: string;
  active: boolean;
  pedidos: number;
  orcamentos: number;
  clientes: number;
  produtos: number;
  faturamento: number;
  ticketMedio: number;
}

export interface EmpresasReport {
  summary: {
    totalEmpresas: number;
    ativas: number;
    semMovimento: number;
    faturamentoGeral: number;
  };
  rows: EmpresaRow[];
  ranking: { name: string; value: number }[];
  monthly: { bucket: string; total: number; series: Record<string, number> }[];
  topNames: string[];
}

export const getEmpresasReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: VendasFilters) => data)
  .handler(async ({ data, context }): Promise<EmpresasReport> => {
    await (await import("@/lib/operator-guard.server")).assertOperatorPermission("reports");
    const { supabase, userId } = context;
    const { data: adminRow } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    const isAdmin = adminRow === true;
    if (!isAdmin) {
      throw new Error("Somente administradores podem acessar o relatório de Empresas.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. All empresas (revendedor + parent null)
    const { data: revRoles } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "revendedor");
    const revIds = Array.from(new Set((revRoles ?? []).map((r) => r.user_id)));
    const { data: empresaProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, store_name, active")
      .in("id", revIds.length ? revIds : ["00000000-0000-0000-0000-000000000000"])
      .is("parent_user_id", null);
    const empresas = (empresaProfiles ?? []) as Array<{
      id: string; full_name: string | null; store_name: string | null; active: boolean;
    }>;

    // Filter by chosen empresa if any (or drop the internal TOTALMAXX company)
    const excludedIds = data.empresaUserId || !data.excludeTotalmaxx
      ? []
      : await totalmaxxRootIds(supabaseAdmin);
    const filteredEmpresas = data.empresaUserId
      ? empresas.filter((e) => e.id === data.empresaUserId)
      : empresas.filter((e) => !excludedIds.includes(e.id));


    // 2. Map user_id -> empresaId (self or parent)
    const empresaIds = filteredEmpresas.map((e) => e.id);
    const { data: childrenProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, parent_user_id")
      .in("parent_user_id", empresaIds.length ? empresaIds : ["00000000-0000-0000-0000-000000000000"]);
    const ownerOf = new Map<string, string>();
    for (const e of filteredEmpresas) ownerOf.set(e.id, e.id);
    for (const c of childrenProfiles ?? []) {
      if (c.parent_user_id) ownerOf.set(c.id, c.parent_user_id);
    }
    const allUserIds = Array.from(ownerOf.keys());

    // 3. Period range
    const { from, to } = filterRange(data);

    // 4. Fetch orders in period
    let oq = supabaseAdmin
      .from("orders")
      .select("id, user_id, total_value, created_at")
      .in("user_id", allUserIds.length ? allUserIds : ["00000000-0000-0000-0000-000000000000"])
      .limit(20000);
    if (from) oq = oq.gte("created_at", from);
    if (to) oq = oq.lt("created_at", to);
    const { data: orders } = await oq;

    // 5. Budgets in period
    let bq = supabaseAdmin
      .from("budgets")
      .select("id, user_id, created_at")
      .in("user_id", allUserIds.length ? allUserIds : ["00000000-0000-0000-0000-000000000000"])
      .limit(20000);
    if (from) bq = bq.gte("created_at", from);
    if (to) bq = bq.lt("created_at", to);
    const { data: budgetsAll } = await bq;

    // 6. Clients count (all-time)
    const { data: clientsAll } = await supabaseAdmin
      .from("clients").select("id, user_id")
      .in("user_id", allUserIds.length ? allUserIds : ["00000000-0000-0000-0000-000000000000"]);

    // 7. Products count (all-time)
    const { data: productsAll } = await supabaseAdmin
      .from("products").select("id, user_id")
      .in("user_id", allUserIds.length ? allUserIds : ["00000000-0000-0000-0000-000000000000"]);

    // 8. Aggregate per empresa
    type Agg = { pedidos: number; orcamentos: number; clientes: number; produtos: number; faturamento: number };
    const agg = new Map<string, Agg>();
    for (const e of filteredEmpresas) {
      agg.set(e.id, { pedidos: 0, orcamentos: 0, clientes: 0, produtos: 0, faturamento: 0 });
    }
    for (const o of orders ?? []) {
      const eid = ownerOf.get(o.user_id);
      if (!eid) continue;
      const a = agg.get(eid); if (!a) continue;
      a.pedidos += 1;
      a.faturamento += Number(o.total_value) || 0;
    }
    for (const b of budgetsAll ?? []) {
      const eid = ownerOf.get(b.user_id);
      if (!eid) continue;
      const a = agg.get(eid); if (!a) continue;
      a.orcamentos += 1;
    }
    for (const c of clientsAll ?? []) {
      const eid = ownerOf.get(c.user_id);
      if (!eid) continue;
      const a = agg.get(eid); if (!a) continue;
      a.clientes += 1;
    }
    for (const p of productsAll ?? []) {
      const eid = ownerOf.get(p.user_id);
      if (!eid) continue;
      const a = agg.get(eid); if (!a) continue;
      a.produtos += 1;
    }

    const rows: EmpresaRow[] = filteredEmpresas.map((e) => {
      const a = agg.get(e.id) ?? { pedidos: 0, orcamentos: 0, clientes: 0, produtos: 0, faturamento: 0 };
      return {
        id: e.id,
        name: e.store_name || e.full_name || "—",
        active: !!e.active,
        pedidos: a.pedidos,
        orcamentos: a.orcamentos,
        clientes: a.clientes,
        produtos: a.produtos,
        faturamento: a.faturamento,
        ticketMedio: a.pedidos > 0 ? a.faturamento / a.pedidos : 0,
      };
    }).sort((a, b) => b.faturamento - a.faturamento);

    const totalEmpresas = filteredEmpresas.length;
    const ativas = rows.filter((r) => r.active).length;
    const semMovimento = rows.filter((r) => r.pedidos === 0 && r.orcamentos === 0).length;
    const faturamentoGeral = rows.reduce((s, r) => s + r.faturamento, 0);

    const ranking = rows.slice(0, 10).map((r) => ({ name: r.name, value: r.faturamento }));

    // Monthly comparative: last 6 months, top 5 empresas
    const topFive = rows.slice(0, 5).map((r) => r.id);
    const idToName = new Map(rows.map((r) => [r.id, r.name]));
    const now = new Date();
    const monthBuckets: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthBuckets.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();
    const { data: ordersFor6 } = await supabaseAdmin
      .from("orders")
      .select("user_id, total_value, created_at")
      .in("user_id", allUserIds.length ? allUserIds : ["00000000-0000-0000-0000-000000000000"])
      .gte("created_at", monthStart)
      .limit(20000);
    const monthMap = new Map<string, { total: number; series: Record<string, number> }>();
    for (const bk of monthBuckets) monthMap.set(bk, { total: 0, series: {} });
    for (const o of ordersFor6 ?? []) {
      const eid = ownerOf.get(o.user_id);
      if (!eid) continue;
      const d = new Date(o.created_at);
      const bk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const m = monthMap.get(bk);
      if (!m) continue;
      const v = Number(o.total_value) || 0;
      m.total += v;
      if (topFive.includes(eid)) {
        const nm = idToName.get(eid) ?? "—";
        m.series[nm] = (m.series[nm] ?? 0) + v;
      }
    }
    const monthly = monthBuckets.map((bk) => ({ bucket: bk, ...(monthMap.get(bk)!) }));

    return {
      summary: { totalEmpresas, ativas, semMovimento, faturamentoGeral },
      rows,
      ranking,
      monthly,
      topNames: topFive.map((id) => idToName.get(id) ?? "—"),
    };
  });

// ============================================================================
// Central de Inteligência (rule-based, no AI)
// ============================================================================

export type InsightLevel = "positive" | "attention" | "alert";

export interface Insight {
  id: string;
  level: InsightLevel;
  title: string;
  message: string;
}

export const getInsightsReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: VendasFilters) => data)
  .handler(async ({ data, context }): Promise<{ insights: Insight[] }> => {
    await (await import("@/lib/operator-guard.server")).assertOperatorPermission("reports");
    const scope = await resolveEmpresaScope(context, data.empresaUserId, data.excludeTotalmaxx);
    const { client, userIds } = scope;


    // Windows: current period vs previous same-size
    const { from, to } = filterRange(data);
    const now = Date.now();
    const fromTs = from ? new Date(from).getTime() : new Date(now - 30 * 86400000).getTime();
    const toTs = to ? new Date(to).getTime() : now;
    const windowSize = toTs - fromTs;
    const prevFrom = new Date(fromTs - windowSize).toISOString();
    const prevTo = new Date(fromTs).toISOString();

    // Orders: current + previous period
    let curOrdersQ = client
      .from("orders")
      .select("id, total_value, created_at, user_id, operator_id, operator_name, budget_id, budgets:budget_id(client_id, details)")
      .gte("created_at", new Date(fromTs).toISOString())
      .lt("created_at", new Date(toTs).toISOString())
      .limit(5000);
    if (userIds) curOrdersQ = curOrdersQ.in("user_id", userIds);
    const { data: curOrders } = await curOrdersQ;

    let prevOrdersQ = client
      .from("orders")
      .select("id, total_value, created_at, user_id")
      .gte("created_at", prevFrom).lt("created_at", prevTo)
      .limit(5000);
    if (userIds) prevOrdersQ = prevOrdersQ.in("user_id", userIds);
    const { data: prevOrders } = await prevOrdersQ;

    // Budgets in current period
    let bq = client
      .from("budgets")
      .select("id, total_value, status, created_at, user_id, operator_id, operator_name")
      .gte("created_at", new Date(fromTs).toISOString())
      .lt("created_at", new Date(toTs).toISOString())
      .limit(5000);
    if (userIds) bq = bq.in("user_id", userIds);
    const { data: budgetsCur } = await bq;

    const insights: Insight[] = [];
    const cur = (curOrders ?? []) as Array<{ total_value: number | string; budgets: { client_id: string | null; details: Record<string, unknown> | null } | null }>;
    const prev = (prevOrders ?? []) as Array<{ total_value: number | string }>;

    const curFat = cur.reduce((s, o) => s + (Number(o.total_value) || 0), 0);
    const prevFat = prev.reduce((s, o) => s + (Number(o.total_value) || 0), 0);
    const curTicket = cur.length ? curFat / cur.length : 0;
    const prevTicket = prev.length ? prevFat / prev.length : 0;

    // 1. Faturamento vs período anterior
    if (curFat > 0 && prevFat > 0) {
      const pct = ((curFat - prevFat) / prevFat) * 100;
      if (Math.abs(pct) >= 5) {
        insights.push({
          id: "faturamento-diff",
          level: pct >= 0 ? "positive" : "alert",
          title: pct >= 0 ? "Faturamento em alta" : "Faturamento em queda",
          message: `Seu faturamento ${pct >= 0 ? "aumentou" : "diminuiu"} ${Math.abs(pct).toFixed(1)}% em relação ao período anterior.`,
        });
      }
    } else if (curFat > 0 && prevFat === 0) {
      insights.push({
        id: "faturamento-novo",
        level: "positive",
        title: "Novo faturamento no período",
        message: `Seu faturamento neste período foi de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(curFat)}.`,
      });
    }

    // 2. Ticket médio vs anterior
    if (curTicket > 0 && prevTicket > 0) {
      const diff = curTicket - prevTicket;
      if (Math.abs(diff) >= 5) {
        insights.push({
          id: "ticket-diff",
          level: diff >= 0 ? "positive" : "attention",
          title: diff >= 0 ? "Ticket médio em alta" : "Ticket médio em queda",
          message: `Seu ticket médio ${diff >= 0 ? "aumentou" : "diminuiu"} ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(diff))}.`,
        });
      }
    }

    // 3. Pedidos vs anterior
    if (prev.length > 0) {
      const diff = cur.length - prev.length;
      if (Math.abs(diff) >= 1) {
        insights.push({
          id: "pedidos-diff",
          level: diff >= 0 ? "positive" : "attention",
          title: diff >= 0 ? "Mais pedidos no período" : "Menos pedidos no período",
          message: `A quantidade de pedidos ${diff >= 0 ? "aumentou" : "diminuiu"} em relação ao período anterior (${cur.length} vs ${prev.length}).`,
        });
      }
    }

    // 4. Taxa de aprovação
    const bList = (budgetsCur ?? []) as Array<{ status: string }>;
    if (bList.length > 0) {
      const aprov = bList.filter((b) => isAprovadoStatus(b.status)).length;
      const pct = (aprov / bList.length) * 100;
      if (pct >= 70) {
        insights.push({
          id: "aprovacao-alta",
          level: "positive",
          title: "Ótima taxa de aprovação",
          message: `Foram aprovados ${pct.toFixed(0)}% dos orçamentos.`,
        });
      } else if (pct <= 30) {
        insights.push({
          id: "aprovacao-baixa",
          level: "alert",
          title: "Taxa de aprovação baixa",
          message: `Apenas ${pct.toFixed(0)}% dos orçamentos foram aprovados.`,
        });
      } else {
        insights.push({
          id: "aprovacao-media",
          level: "attention",
          title: "Taxa de aprovação",
          message: `Foram aprovados ${pct.toFixed(0)}% dos orçamentos.`,
        });
      }
    }

    // 5. Fornecedor concentração — via extractParts
    const budgetIds = cur.map((o: { budgets: unknown }) => (o as { budget_id?: string }).budget_id).filter((v): v is string => !!v);
    if (budgetIds.length > 0) {
      const { data: itemRows } = await client
        .from("budget_items").select("data, budget_id").in("budget_id", budgetIds);
      const pMap = (await buildProductLookup(client)).map;
      const supTotals = new Map<string, number>();
      const prodTotals = new Map<string, { code: string; name: string; value: number; qty: number }>();
      let grand = 0;
      for (const it of itemRows ?? []) {
        const parts = extractParts((it.data ?? {}) as Record<string, unknown>);
        for (const part of parts) {
          const meta = pMap.get(part.productId);
          const sup = meta?.supplier ?? "—";
          supTotals.set(sup, (supTotals.get(sup) ?? 0) + part.value);
          grand += part.value;
          const key = part.productId;
          const ex = prodTotals.get(key);
          if (ex) { ex.value += part.value; ex.qty += 1; }
          else prodTotals.set(key, { code: meta?.code || part.code, name: meta?.description || part.description || "Produto", value: part.value, qty: 1 });
        }
      }
      if (grand > 0) {
        const topSup = Array.from(supTotals.entries()).sort((a, b) => b[1] - a[1])[0];
        if (topSup) {
          const pct = (topSup[1] / grand) * 100;
          if (pct >= 50) {
            insights.push({
              id: "fornecedor-concentracao",
              level: pct >= 70 ? "attention" : "positive",
              title: "Concentração de fornecedor",
              message: `O fornecedor ${topSup[0]} representa ${pct.toFixed(0)}% das vendas.`,
            });
          }
        }
        const topProd = Array.from(prodTotals.values()).sort((a, b) => b.qty - a.qty)[0];
        if (topProd) {
          insights.push({
            id: "produto-top",
            level: "positive",
            title: "Produto mais vendido",
            message: `O produto ${topProd.code || topProd.name} continua sendo o mais vendido${topProd.qty > 1 ? ` (${topProd.qty} unidades)` : ""}.`,
          });
        }
      }
    }

    // 6. Cliente inativo (última compra > 30 dias)
    let cq = client.from("clients").select("id, name, user_id").limit(2000);
    if (userIds) cq = cq.in("user_id", userIds);
    const { data: clientsAll } = await cq;
    let allOrdersQ = client.from("orders")
      .select("created_at, budget_id, budgets:budget_id(client_id)")
      .order("created_at", { ascending: false }).limit(5000);
    if (userIds) allOrdersQ = allOrdersQ.in("user_id", userIds);
    const { data: allOrders } = await allOrdersQ;
    const lastByClient = new Map<string, string>();
    for (const o of allOrders ?? []) {
      const cid = (o as { budgets: { client_id: string | null } | null }).budgets?.client_id;
      if (!cid) continue;
      if (!lastByClient.has(cid)) lastByClient.set(cid, o.created_at as string);
    }
    const cList = (clientsAll ?? []) as Array<{ id: string; name: string }>;
    // active clients count
    const activeCount = cList.filter((c) => {
      const last = lastByClient.get(c.id);
      if (!last) return false;
      return (now - new Date(last).getTime()) / 86400000 <= 90;
    }).length;
    if (activeCount > 0) {
      insights.push({
        id: "clientes-ativos",
        level: "positive",
        title: "Clientes ativos",
        message: `A empresa possui ${activeCount} cliente(s) ativo(s) (compra nos últimos 90 dias).`,
      });
    }
    // Longest inactive client (had at least one order)
    const inativos = cList
      .map((c) => {
        const last = lastByClient.get(c.id);
        if (!last) return null;
        const days = Math.floor((now - new Date(last).getTime()) / 86400000);
        return { name: c.name, days };
      })
      .filter((x): x is { name: string; days: number } => x !== null && x.days >= 30)
      .sort((a, b) => b.days - a.days);
    if (inativos.length > 0) {
      const w = inativos[0];
      insights.push({
        id: "cliente-inativo",
        level: w.days >= 90 ? "alert" : "attention",
        title: "Cliente sem comprar",
        message: `O cliente ${w.name} não compra há ${w.days} dias.`,
      });
    }

    // 7. Colaborador com maior conversão (inline, evitando chamar outra server fn)
    try {
      type OpAgg = { name: string; orc: number; ped: number };
      const byOp = new Map<string, OpAgg>();
      for (const b of bList as unknown as Array<{ operator_id: string | null; operator_name: string | null }>) {
        const k = b.operator_id || (b.operator_name ?? "").toLowerCase();
        if (!k) continue;
        const a = byOp.get(k) ?? { name: b.operator_name ?? "—", orc: 0, ped: 0 };
        a.orc += 1;
        byOp.set(k, a);
      }
      for (const o of cur as unknown as Array<{ operator_id: string | null; operator_name: string | null }>) {
        const k = o.operator_id || (o.operator_name ?? "").toLowerCase();
        if (!k) continue;
        const a = byOp.get(k) ?? { name: o.operator_name ?? "—", orc: 0, ped: 0 };
        a.ped += 1;
        if (!byOp.has(k)) byOp.set(k, a);
      }
      const best = Array.from(byOp.values())
        .filter((a) => a.orc >= 3)
        .map((a) => ({ ...a, conv: (a.ped / a.orc) * 100 }))
        .sort((a, b) => b.conv - a.conv)[0];
      if (best && best.conv >= 50) {
        insights.push({
          id: "colab-conversao",
          level: "positive",
          title: "Melhor conversão",
          message: `O colaborador ${best.name} possui a maior taxa de conversão (${best.conv.toFixed(0)}%).`,
        });
      }
    } catch { /* skip */ }

    return { insights };
  });
