import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMAIL_DOMAIN = "totalmaxx.local";
const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

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

async function ensureManager(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "revendedor"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0)
    throw new Error("Acesso negado: apenas administradores e revendedores podem gerenciar colaboradores.");
}

async function ensureOwnership(supabaseAdmin: any, colaboradorId: string, parentUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, parent_user_id")
    .eq("id", colaboradorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.parent_user_id !== parentUserId) {
    throw new Error("Colaborador não pertence a este revendedor.");
  }
}

export const listColaboradores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureManager(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, username, created_at, active, can_edit_budgets, can_create_products, can_create_clients, can_delete_orders, max_discount_percent, pin_hash")
      .eq("parent_user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (profiles ?? []).map((p: any) => ({
      ...p,
      has_pin: !!p.pin_hash,
      pin_hash: undefined,
    }));
  });

/**
 * List active collaborators of the current owner for the operator picker.
 * Returns only safe fields (id, full_name, has_pin).
 */
export const listActiveOperators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // The signed-in user may be a colaborador themselves; resolve their owner.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("id, parent_user_id")
      .eq("id", context.userId)
      .maybeSingle();
    const ownerId = (me?.parent_user_id as string | null) ?? context.userId;

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, username, pin_hash, active")
      .eq("parent_user_id", ownerId)
      .eq("active", true)
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({
      id: p.id as string,
      full_name: (p.full_name as string | null) ?? p.username ?? "Colaborador",
      username: p.username as string | null,
      has_pin: !!p.pin_hash,
    }));
  });

const pinSchema = z
  .string()
  .regex(/^\d{4,6}$/, "PIN deve conter 4 a 6 dígitos.");

const validatePinSchema = z.object({
  operator_id: z.string().uuid(),
  pin: pinSchema,
});

/**
 * Validate an operator PIN. Returns operator info + permissions when OK.
 */
export const validateOperatorPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => validatePinSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("id, parent_user_id")
      .eq("id", context.userId)
      .maybeSingle();
    const ownerId = (me?.parent_user_id as string | null) ?? context.userId;

    const { data: op, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, full_name, username, active, parent_user_id, pin_hash, can_edit_budgets, can_create_products, can_create_clients, can_delete_orders, max_discount_percent",
      )
      .eq("id", data.operator_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!op || op.parent_user_id !== ownerId || !op.active) {
      throw new Error("Operador inválido.");
    }
    if (!op.pin_hash || !verifyPin(data.pin, op.pin_hash as string)) {
      throw new Error("PIN incorreto.");
    }
    return {
      id: op.id as string,
      full_name: (op.full_name as string | null) ?? (op.username as string | null) ?? "Operador",
      username: op.username as string | null,
      permissions: {
        can_edit_budgets: !!op.can_edit_budgets,
        can_create_products: !!op.can_create_products,
        can_create_clients: !!op.can_create_clients,
        can_delete_orders: !!op.can_delete_orders,
        max_discount_percent: Number(op.max_discount_percent ?? 100),
      },
    };
  });

const createSchema = z.object({
  full_name: z.string().min(1).max(120),
  username: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9._-]+$/i),
  password: z.string().min(6).max(72),
  pin: pinSchema.optional(),
});

/**
 * Transactional-ish create: ensures Auth user, profile, parent link, role
 * and optional PIN. If a stale Auth user exists (previous failed attempt),
 * it recovers by updating password/profile instead of blocking.
 */
export const createColaborador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureManager(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const username = data.username.toLowerCase();
    const email = usernameToEmail(username);

    // 1. Locate or create Auth user (idempotent).
    let userId: string | null = null;
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, parent_user_id, username")
      .eq("username", username)
      .maybeSingle();

    if (existingProfile) {
      // If it already belongs to someone else → block.
      if (
        existingProfile.parent_user_id &&
        existingProfile.parent_user_id !== context.userId
      ) {
        throw new Error("Este usuário já pertence a outro revendedor.");
      }
      userId = existingProfile.id as string;
    } else {
      // Try to find existing Auth user by email (previous failed attempt).
      const { data: authList } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      const found = authList?.users?.find(
        (u) => (u.email ?? "").toLowerCase() === email,
      );
      if (found) {
        userId = found.id;
      } else {
        const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: data.password,
          email_confirm: true,
          user_metadata: {
            full_name: data.full_name,
            username,
          },
        });
        if (error) throw new Error(error.message);
        userId = created.user?.id ?? null;
      }
    }
    if (!userId) throw new Error("Falha ao criar usuário.");

    // 2. Reset password (for both new and recovered users → ensures caller's password works).
    await supabaseAdmin.auth.admin
      .updateUserById(userId, { password: data.password })
      .catch(() => {});

    // 3. Ensure profile row exists (trigger normally creates it; upsert as safety net).
    const profilePatch: Record<string, unknown> = {
      id: userId,
      full_name: data.full_name,
      username,
      parent_user_id: context.userId,
      active: true,
    };
    if (data.pin) profilePatch.pin_hash = hashPin(data.pin);

    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .upsert(profilePatch as never, { onConflict: "id" });
    if (upErr) throw new Error(upErr.message);

    // 4. Ensure role is 'colaborador'.
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: userId, role: "colaborador" },
        { onConflict: "user_id,role" },
      );
    if (roleErr) throw new Error(roleErr.message);

    return { id: userId };
  });

const resetSchema = z.object({
  user_id: z.string().uuid(),
  password: z.string().min(6).max(72),
});

export const resetColaboradorPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => resetSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureManager(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureOwnership(supabaseAdmin, data.user_id, context.userId);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const toggleSchema = z.object({
  user_id: z.string().uuid(),
  active: z.boolean(),
});

export const toggleColaboradorActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => toggleSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureManager(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureOwnership(supabaseAdmin, data.user_id, context.userId);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ active: data.active })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);

    if (!data.active) {
      await supabaseAdmin.auth.admin.signOut(data.user_id, "global").catch(() => {});
    }
    return { ok: true };
  });

const updateSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().min(1).max(120),
  can_edit_budgets: z.boolean().optional(),
  can_create_products: z.boolean().optional(),
  can_create_clients: z.boolean().optional(),
  can_delete_orders: z.boolean().optional(),
  max_discount_percent: z.number().min(0).max(100).optional(),
  pin: pinSchema.optional(),
});

export const updateColaborador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureManager(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureOwnership(supabaseAdmin, data.user_id, context.userId);

    const patch: Record<string, unknown> = { full_name: data.full_name };
    if (data.can_edit_budgets !== undefined) patch.can_edit_budgets = data.can_edit_budgets;
    if (data.can_create_products !== undefined) patch.can_create_products = data.can_create_products;
    if (data.can_create_clients !== undefined) patch.can_create_clients = data.can_create_clients;
    if (data.can_delete_orders !== undefined) patch.can_delete_orders = data.can_delete_orders;
    if (data.max_discount_percent !== undefined) patch.max_discount_percent = data.max_discount_percent;
    if (data.pin) patch.pin_hash = hashPin(data.pin);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const deleteSchema = z.object({ user_id: z.string().uuid() });

export const deleteColaborador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureManager(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureOwnership(supabaseAdmin, data.user_id, context.userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
