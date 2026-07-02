import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPin(pin: string, stored: string): boolean {
  try {
    const [algo, salt, hashHex] = stored.split(":");
    if (algo !== "scrypt" || !salt || !hashHex) return false;
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(pin, salt, expected.length);
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

const pinSchema = z.string().regex(/^\d{4,6}$/, "PIN deve conter 4 a 6 dígitos.");

/**
 * Resolve the caller context: owner (loja) and whether the caller itself is an
 * operational (colaborador) account.
 */
async function resolveCaller(
  supabaseAdmin: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> };
      };
    };
  },
  userId: string,
): Promise<{ ownerId: string; isOperational: boolean }> {
  const { data } = (await supabaseAdmin
    .from("profiles")
    .select("id, parent_user_id")
    .eq("id", userId)
    .maybeSingle()) as { data: { id: string; parent_user_id: string | null } | null };
  const parent = data?.parent_user_id ?? null;
  return { ownerId: parent ?? userId, isOperational: !!parent };
}

/** List operators visible to the current caller (respects operational scoping). */
export const listOperators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ownerId, isOperational } = await resolveCaller(supabaseAdmin, context.userId);
    let q = supabaseAdmin
      .from("operators")
      .select(
        "id, name, nickname, active, operational_account_id, pin_hash, can_edit_budgets, can_create_products, can_create_clients, can_delete_orders, max_discount_percent, created_at",
      )
      .eq("owner_user_id", ownerId)
      .order("name", { ascending: true });
    if (isOperational) q = q.eq("operational_account_id", context.userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((o: Record<string, unknown>) => ({
      id: o.id as string,
      name: o.name as string,
      nickname: (o.nickname as string | null) ?? null,
      active: !!o.active,
      operational_account_id: (o.operational_account_id as string | null) ?? null,
      has_pin: !!o.pin_hash,
      can_edit_budgets: !!o.can_edit_budgets,
      can_create_products: !!o.can_create_products,
      can_create_clients: !!o.can_create_clients,
      can_delete_orders: !!o.can_delete_orders,
      max_discount_percent: Number(o.max_discount_percent ?? 10),
      created_at: o.created_at as string,
    }));
  });

/** List active operators for the operator picker. Same scoping rules. */
export const listActiveOperatorsV2 = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ownerId, isOperational } = await resolveCaller(supabaseAdmin, context.userId);
    let q = supabaseAdmin
      .from("operators")
      .select("id, name, nickname, pin_hash")
      .eq("owner_user_id", ownerId)
      .eq("active", true)
      .order("name", { ascending: true });
    if (isOperational) q = q.eq("operational_account_id", context.userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((o: Record<string, unknown>) => ({
      id: o.id as string,
      full_name: o.name as string,
      username: (o.nickname as string | null) ?? null,
      has_pin: !!o.pin_hash,
    }));
  });

const createSchema = z.object({
  name: z.string().min(1).max(120),
  nickname: z.string().max(60).optional(),
  pin: pinSchema,
  operational_account_id: z.string().uuid().nullable().optional(),
  can_edit_budgets: z.boolean().optional(),
  can_create_products: z.boolean().optional(),
  can_create_clients: z.boolean().optional(),
  can_delete_orders: z.boolean().optional(),
  max_discount_percent: z.number().min(0).max(100).optional(),
});

export const createOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ownerId, isOperational } = await resolveCaller(supabaseAdmin, context.userId);

    // Operational accounts can only create operators under themselves.
    const opAcct = isOperational
      ? context.userId
      : (data.operational_account_id ?? null);

    // If specifying an operational account, ensure it belongs to this owner.
    if (opAcct) {
      const { data: acct } = await supabaseAdmin
        .from("profiles")
        .select("id, parent_user_id")
        .eq("id", opAcct)
        .maybeSingle();
      const acctRow = acct as { parent_user_id: string | null } | null;
      if (!acctRow || acctRow.parent_user_id !== ownerId) {
        throw new Error("Conta operacional inválida.");
      }
    }

    const payload = {
      owner_user_id: ownerId,
      operational_account_id: opAcct,
      name: data.name,
      nickname: data.nickname ?? null,
      pin_hash: hashPin(data.pin),
      can_edit_budgets: data.can_edit_budgets ?? true,
      can_create_products: data.can_create_products ?? true,
      can_create_clients: data.can_create_clients ?? true,
      can_delete_orders: data.can_delete_orders ?? false,
      max_discount_percent: data.max_discount_percent ?? 10,
    };
    const { data: row, error } = await supabaseAdmin
      .from("operators")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  nickname: z.string().max(60).nullable().optional(),
  active: z.boolean().optional(),
  pin: pinSchema.optional(),
  operational_account_id: z.string().uuid().nullable().optional(),
  can_edit_budgets: z.boolean().optional(),
  can_create_products: z.boolean().optional(),
  can_create_clients: z.boolean().optional(),
  can_delete_orders: z.boolean().optional(),
  max_discount_percent: z.number().min(0).max(100).optional(),
});

export const updateOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ownerId, isOperational } = await resolveCaller(supabaseAdmin, context.userId);

    const { data: existing } = await supabaseAdmin
      .from("operators")
      .select("id, owner_user_id, operational_account_id")
      .eq("id", data.id)
      .maybeSingle();
    const row = existing as {
      owner_user_id: string;
      operational_account_id: string | null;
    } | null;
    if (!row || row.owner_user_id !== ownerId) throw new Error("Operador não encontrado.");
    if (isOperational && row.operational_account_id !== context.userId) {
      throw new Error("Sem permissão para editar este operador.");
    }

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.nickname !== undefined) patch.nickname = data.nickname;
    if (data.active !== undefined) patch.active = data.active;
    if (data.pin) patch.pin_hash = hashPin(data.pin);
    if (data.can_edit_budgets !== undefined) patch.can_edit_budgets = data.can_edit_budgets;
    if (data.can_create_products !== undefined) patch.can_create_products = data.can_create_products;
    if (data.can_create_clients !== undefined) patch.can_create_clients = data.can_create_clients;
    if (data.can_delete_orders !== undefined) patch.can_delete_orders = data.can_delete_orders;
    if (data.max_discount_percent !== undefined) patch.max_discount_percent = data.max_discount_percent;
    if (!isOperational && data.operational_account_id !== undefined) {
      patch.operational_account_id = data.operational_account_id;
    }

    const { error } = await supabaseAdmin.from("operators").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const deleteSchema = z.object({ id: z.string().uuid() });

export const deleteOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ownerId, isOperational } = await resolveCaller(supabaseAdmin, context.userId);
    const { data: existing } = await supabaseAdmin
      .from("operators")
      .select("id, owner_user_id, operational_account_id")
      .eq("id", data.id)
      .maybeSingle();
    const row = existing as {
      owner_user_id: string;
      operational_account_id: string | null;
    } | null;
    if (!row || row.owner_user_id !== ownerId) throw new Error("Operador não encontrado.");
    if (isOperational && row.operational_account_id !== context.userId) {
      throw new Error("Sem permissão para excluir este operador.");
    }
    const { error } = await supabaseAdmin.from("operators").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const validateSchema = z.object({
  operator_id: z.string().uuid(),
  pin: pinSchema,
});

export const validateOperatorPinV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => validateSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ownerId, isOperational } = await resolveCaller(supabaseAdmin, context.userId);

    const { data: op, error } = await supabaseAdmin
      .from("operators")
      .select(
        "id, name, nickname, active, owner_user_id, operational_account_id, pin_hash, can_edit_budgets, can_create_products, can_create_clients, can_delete_orders, max_discount_percent",
      )
      .eq("id", data.operator_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = op as Record<string, unknown> | null;
    if (
      !row ||
      row.owner_user_id !== ownerId ||
      !row.active ||
      (isOperational && row.operational_account_id !== context.userId)
    ) {
      throw new Error("Operador inválido.");
    }
    if (!row.pin_hash || !verifyPin(data.pin, row.pin_hash as string)) {
      throw new Error("PIN incorreto.");
    }
    return {
      id: row.id as string,
      full_name: (row.name as string) ?? "Operador",
      username: (row.nickname as string | null) ?? null,
      permissions: {
        can_edit_budgets: !!row.can_edit_budgets,
        can_create_products: !!row.can_create_products,
        can_create_clients: !!row.can_create_clients,
        can_delete_orders: !!row.can_delete_orders,
        max_discount_percent: Number(row.max_discount_percent ?? 10),
      },
    };
  });

/** List operational (colaborador) accounts for the dropdown when creating operators. */
export const listOperationalAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ownerId, isOperational } = await resolveCaller(supabaseAdmin, context.userId);
    if (isOperational) return [];
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, username, active")
      .eq("parent_user_id", ownerId)
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      full_name: (r.full_name as string | null) ?? (r.username as string | null) ?? "Conta",
      username: (r.username as string | null) ?? null,
      active: !!r.active,
    }));
  });
