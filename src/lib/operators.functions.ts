import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toPermissions } from "@/lib/permissions";

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

const PERM_COLUMNS =
  "is_owner, can_access_reports, can_access_history, can_delete_orders, can_manage_registrations, reg_clients, reg_products, reg_suppliers, reg_architects, reg_carriers, max_discount_percent";

const permsSchema = {
  is_owner: z.boolean().optional(),
  can_access_reports: z.boolean().optional(),
  can_access_history: z.boolean().optional(),
  can_delete_orders: z.boolean().optional(),
  can_manage_registrations: z.boolean().optional(),
  reg_clients: z.boolean().optional(),
  reg_products: z.boolean().optional(),
  reg_suppliers: z.boolean().optional(),
  reg_architects: z.boolean().optional(),
  reg_carriers: z.boolean().optional(),
  max_discount_percent: z.number().min(0).max(100).optional(),
};

const PERM_FIELDS = Object.keys(permsSchema) as Array<keyof typeof permsSchema>;

/**
 * Resolve the caller context: owner (loja) and whether the caller itself is an
 * operational (colaborador) account.
 */
async function resolveCaller(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  userId: string,
): Promise<{ ownerId: string; isOperational: boolean }> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, parent_user_id")
    .eq("id", userId)
    .maybeSingle();
  const parent = (data?.parent_user_id as string | null) ?? null;
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
        `id, name, nickname, active, operational_account_id, pin_hash, created_at, ${PERM_COLUMNS}`,
      )
      .eq("owner_user_id", ownerId)
      .order("name", { ascending: true });
    if (isOperational) q = q.eq("operational_account_id", context.userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map((o) => ({
      id: o.id as string,
      name: o.name as string,
      nickname: (o.nickname as string | null) ?? null,
      active: !!o.active,
      operational_account_id: (o.operational_account_id as string | null) ?? null,
      has_pin: !!o.pin_hash,
      created_at: o.created_at as string,
      ...toPermissions(o),
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
    return ((data ?? []) as Record<string, unknown>[]).map((o) => ({
      id: o.id as string,
      full_name: o.name as string,
      username: (o.nickname as string | null) ?? null,
      has_pin: !!o.pin_hash,
    }));
  });

/**
 * Somente o proprietário da empresa (conta principal ou usuário interno
 * marcado como proprietário) pode gerenciar usuários.
 */
async function assertOwnerManager(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  callerUserId: string,
  isOperational: boolean,
) {
  if (isOperational) return; // contas operacionais já são limitadas ao próprio escopo
  const { data: adminRole } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerUserId)
    .eq("role", "admin")
    .maybeSingle();
  if (adminRole) return;
  const { currentOperator } = await import("@/lib/operator-guard.server");
  const op = await currentOperator();
  if (!op || !op.permissions.is_owner) {
    throw new Error("Apenas o proprietário da empresa pode gerenciar usuários.");
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  nickname: z.string().max(60).optional(),
  pin: pinSchema,
  operational_account_id: z.string().uuid().nullable().optional(),
  ...permsSchema,
});

export const createOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ownerId, isOperational } = await resolveCaller(supabaseAdmin, context.userId);
    await assertOwnerManager(supabaseAdmin, context.userId, isOperational);

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

    const payload: Record<string, unknown> = {
      owner_user_id: ownerId,
      operational_account_id: opAcct,
      name: data.name,
      nickname: data.nickname ?? null,
      pin_hash: hashPin(data.pin),
      is_owner: data.is_owner ?? false,
      can_access_reports: data.can_access_reports ?? false,
      can_access_history: data.can_access_history ?? false,
      can_delete_orders: data.can_delete_orders ?? false,
      can_manage_registrations: data.can_manage_registrations ?? false,
      reg_clients: data.reg_clients ?? false,
      reg_products: data.reg_products ?? false,
      reg_suppliers: data.reg_suppliers ?? false,
      reg_architects: data.reg_architects ?? false,
      reg_carriers: data.reg_carriers ?? false,
      max_discount_percent: data.max_discount_percent ?? 0,
    };
    const { data: row, error } = await supabaseAdmin
      .from("operators")
      .insert(payload as never)
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
  ...permsSchema,
});

export const updateOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ownerId, isOperational } = await resolveCaller(supabaseAdmin, context.userId);
    await assertOwnerManager(supabaseAdmin, context.userId, isOperational);

    const { data: existing } = await supabaseAdmin
      .from("operators")
      .select("id, owner_user_id, operational_account_id")
      .eq("id", data.id)
      .maybeSingle();
    const row = existing as {
      owner_user_id: string;
      operational_account_id: string | null;
    } | null;
    if (!row || row.owner_user_id !== ownerId) throw new Error("Usuário não encontrado.");
    if (isOperational && row.operational_account_id !== context.userId) {
      throw new Error("Sem permissão para editar este usuário.");
    }

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.nickname !== undefined) patch.nickname = data.nickname;
    if (data.active !== undefined) patch.active = data.active;
    if (data.pin) patch.pin_hash = hashPin(data.pin);
    for (const field of PERM_FIELDS) {
      const value = (data as Record<string, unknown>)[field];
      if (value !== undefined) patch[field] = value;
    }
    if (!isOperational && data.operational_account_id !== undefined) {
      patch.operational_account_id = data.operational_account_id;
    }

    const { error } = await supabaseAdmin.from("operators").update(patch as never).eq("id", data.id);
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
    await assertOwnerManager(supabaseAdmin, context.userId, isOperational);
    const { data: existing } = await supabaseAdmin
      .from("operators")
      .select("id, owner_user_id, operational_account_id")
      .eq("id", data.id)
      .maybeSingle();
    const row = existing as {
      owner_user_id: string;
      operational_account_id: string | null;
    } | null;
    if (!row || row.owner_user_id !== ownerId) throw new Error("Usuário não encontrado.");
    if (isOperational && row.operational_account_id !== context.userId) {
      throw new Error("Sem permissão para excluir este usuário.");
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
    const { ownerId } = await resolveCaller(supabaseAdmin, context.userId);

    const { data: op, error } = await supabaseAdmin
      .from("operators")
      .select(
        `id, name, nickname, active, owner_user_id, pin_hash, locked_until, ${PERM_COLUMNS}`,
      )
      .eq("id", data.operator_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = op as Record<string, unknown> | null;
    if (!row || row.owner_user_id !== ownerId || !row.active) {
      throw new Error("Usuário inválido.");
    }
    const lockedUntil = row.locked_until ? new Date(row.locked_until as string) : null;
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      const err = new Error(
        `Usuário bloqueado até ${lockedUntil.toLocaleTimeString("pt-BR")}.`,
      );
      (err as unknown as { locked_until: string }).locked_until =
        lockedUntil.toISOString();
      throw err;
    }
    const ok = !!row.pin_hash && verifyPin(data.pin, row.pin_hash as string);
    try {
      await supabaseAdmin.rpc("register_pin_attempt", {
        _operator_id: data.operator_id,
        _success: ok,
      });
    } catch (e) {
      // best-effort
      console.warn("register_pin_attempt falhou", e);
    }
    if (!ok) throw new Error("PIN incorreto.");

    const { issueOperatorToken } = await import("@/lib/operator-token.server");
    return {
      id: row.id as string,
      full_name: (row.name as string) ?? "Usuário",
      username: (row.nickname as string | null) ?? null,
      token: issueOperatorToken(row.id as string, ownerId),
      permissions: toPermissions(row),
    };
  });


/** List Contas de Acesso (operational accounts) for a given company/owner. */
export const listOperationalAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_id: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ownerId: callerOwnerId, isOperational } = await resolveCaller(
      supabaseAdmin,
      context.userId,
    );
    if (isOperational) return [];

    let targetOwner = callerOwnerId;
    if (data?.company_id && data.company_id !== callerOwnerId) {
      const { data: adminRole } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", "admin")
        .maybeSingle();
      if (!adminRole) {
        throw new Error("Sem permissão para listar contas desta empresa.");
      }
      targetOwner = data.company_id;
    }

    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, username, active")
      .eq("parent_user_id", targetOwner)
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      full_name: (r.full_name as string | null) ?? (r.username as string | null) ?? "Conta",
      username: (r.username as string | null) ?? null,
      active: !!r.active,
    }));
  });
