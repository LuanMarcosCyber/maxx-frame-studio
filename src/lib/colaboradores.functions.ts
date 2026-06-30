import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMAIL_DOMAIN = "totalmaxx.local";
const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

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
      .select("id, full_name, username, created_at, active, can_edit_budgets, can_create_products, can_create_clients, can_delete_orders, max_discount_percent")
      .eq("parent_user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return profiles ?? [];
  });

const createSchema = z.object({
  full_name: z.string().min(1).max(120),
  username: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9._-]+$/i),
  password: z.string().min(6).max(72),
});

export const createColaborador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureManager(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const username = data.username.toLowerCase();
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existing) throw new Error("Este usuário já está em uso.");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: usernameToEmail(username),
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        username,
        parent_user_id: context.userId,
      },
    });
    if (error) throw new Error(error.message);

    // Trigger inserts the safe default 'revendedor' role. Update it to
    // 'colaborador' here using the service-role client. Client-supplied
    // role metadata is ignored by the trigger.
    const createdId = created.user?.id;
    if (createdId) {
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .update({ role: "colaborador" })
        .eq("user_id", createdId);
      if (roleErr) throw new Error(roleErr.message);
    }
    return { id: createdId };
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

    // When deactivating, revoke any active sessions so the JWT cannot be
    // used to keep calling the API after the active flag flips.
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
});

export const updateColaborador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureManager(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureOwnership(supabaseAdmin, data.user_id, context.userId);

    const patch: {
      full_name: string;
      can_edit_budgets?: boolean;
      can_create_products?: boolean;
      can_create_clients?: boolean;
      can_delete_orders?: boolean;
      max_discount_percent?: number;
    } = { full_name: data.full_name };
    if (data.can_edit_budgets !== undefined) patch.can_edit_budgets = data.can_edit_budgets;
    if (data.can_create_products !== undefined) patch.can_create_products = data.can_create_products;
    if (data.can_create_clients !== undefined) patch.can_create_clients = data.can_create_clients;
    if (data.can_delete_orders !== undefined) patch.can_delete_orders = data.can_delete_orders;
    if (data.max_discount_percent !== undefined) patch.max_discount_percent = data.max_discount_percent;

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
