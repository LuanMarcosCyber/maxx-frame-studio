import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado: requer perfil admin.");
}

async function ensureResellerId(reseller_id: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", reseller_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.role !== "revendedor") {
    throw new Error("Usuário informado não é um revendedor.");
  }
}

const idSchema = z.object({ reseller_id: z.string().uuid() });

export const getResellerInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    await ensureResellerId(data.reseller_id);
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, username, email, store_name, company_group_id, created_at")
      .eq("id", data.reseller_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Revendedor não encontrado.");

    let group_name: string | null = null;
    if (profile.company_group_id) {
      const { data: parent } = await supabaseAdmin
        .from("profiles")
        .select("store_name, full_name")
        .eq("id", profile.company_group_id)
        .maybeSingle();
      group_name = parent?.store_name || parent?.full_name || null;
    }
    return { ...profile, group_name };
  });

// Lista todas as empresas (revendedores) disponíveis para ser "Empresa principal"
export const listCompaniesForGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "revendedor");
    if (rErr) throw new Error(rErr.message);
    const ids = (roles ?? []).map((r) => r.user_id).filter((id) => id !== data.reseller_id);
    if (ids.length === 0) return [];
    const { data: profs, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, store_name, company_group_id")
      .in("id", ids)
      .order("store_name", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    // Não pode ser matriz uma empresa que já é filial de outra (evita cadeias)
    return (profs ?? []).filter((p) => !p.company_group_id);
  });

const setGroupSchema = z.object({
  reseller_id: z.string().uuid(),
  company_group_id: z.string().uuid().nullable(),
});

export const updateResellerCompanyGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setGroupSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    await ensureResellerId(data.reseller_id);
    if (data.company_group_id) {
      if (data.company_group_id === data.reseller_id) {
        throw new Error("Uma empresa não pode ser vinculada a si mesma.");
      }
      // A empresa principal não pode ser filial de outra
      const { data: parent, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id, company_group_id")
        .eq("id", data.company_group_id)
        .maybeSingle();
      if (pErr) throw new Error(pErr.message);
      if (!parent) throw new Error("Empresa principal não encontrada.");
      if (parent.company_group_id) {
        throw new Error("A empresa principal escolhida já é filial de outra.");
      }
      // Se a empresa atual já é matriz de outras, não pode virar filial
      const { data: children, error: cErr } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("company_group_id", data.reseller_id)
        .limit(1);
      if (cErr) throw new Error(cErr.message);
      if ((children ?? []).length > 0) {
        throw new Error("Esta empresa já é principal de outras. Remova o vínculo das filiais antes.");
      }
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ company_group_id: data.company_group_id })
      .eq("id", data.reseller_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const listResellerProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    await ensureResellerId(data.reseller_id);
    const { data: rows, error } = await supabaseAdmin
      .from("products")
      .select(
        "id, code, description, category, value_per_meter, profit_margin, waste_percentage, created_at",
      )
      .eq("user_id", data.reseller_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listResellerBudgets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    await ensureResellerId(data.reseller_id);
    const { data: rows, error } = await supabaseAdmin
      .from("budgets")
      .select(
        "id, number, client_name, total_value, status, created_at, data_vencimento, details",
      )
      .eq("user_id", data.reseller_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const budgetItemsSchema = z.object({
  reseller_id: z.string().uuid(),
  budget_id: z.string().uuid(),
});

export const getResellerBudgetItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => budgetItemsSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    await ensureResellerId(data.reseller_id);
    // Confirm the budget belongs to that reseller before returning items
    const { data: b, error: bErr } = await supabaseAdmin
      .from("budgets")
      .select("id, user_id")
      .eq("id", data.budget_id)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!b || b.user_id !== data.reseller_id) {
      throw new Error("Orçamento não pertence a este revendedor.");
    }
    const { data: rows, error } = await supabaseAdmin
      .from("budget_items")
      .select("id, position, subtotal, data")
      .eq("budget_id", data.budget_id)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listResellerOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    await ensureResellerId(data.reseller_id);
    const { data: rows, error } = await supabaseAdmin
      .from("orders")
      .select("id, number, client_name, total_value, status, created_at")
      .eq("user_id", data.reseller_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listResellerCollaborators = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    await ensureResellerId(data.reseller_id);
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, username, active, created_at")
      .eq("parent_user_id", data.reseller_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Filter to colaborador role only
    const ids = (profiles ?? []).map((p) => p.id);
    if (ids.length === 0) return [];
    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids);
    if (rErr) throw new Error(rErr.message);
    const collabIds = new Set(
      (roles ?? []).filter((r) => r.role === "colaborador").map((r) => r.user_id),
    );
    return (profiles ?? []).filter((p) => collabIds.has(p.id));
  });
