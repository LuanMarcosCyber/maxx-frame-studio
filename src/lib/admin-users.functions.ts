import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const EMAIL_DOMAIN = "totalmaxx.local";
const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

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

const createUserSchema = z.object({
  full_name: z.string().min(1).max(120),
  store_name: z.string().trim().min(1, "Informe o nome da loja.").max(120),
  username: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9._-]+$/i, "Use letras, números, ponto, hífen ou underscore."),
  password: z.string().min(6).max(72),
  role: z.enum(["admin", "revendedor"]),
});


export const listResellers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, username, created_at")
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);

    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rErr) throw new Error(rErr.message);

    const roleMap = new Map(roles?.map((r) => [r.user_id, r.role]));
    return (profiles ?? [])
      .map((p) => ({
        id: p.id,
        full_name: p.full_name,
        username: p.username,
        created_at: p.created_at,
        role: (roleMap.get(p.id) as "admin" | "revendedor" | "colaborador") ?? "revendedor",
      }))
      .filter((u) => u.role !== "colaborador");
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createUserSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);

    const email = usernameToEmail(data.username);

    // Check username uniqueness in profiles
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", data.username.toLowerCase())
      .maybeSingle();
    if (existing) throw new Error("Este usuário já está em uso.");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        username: data.username.toLowerCase(),
      },
    });
    if (error) throw new Error(error.message);

    // The handle_new_user trigger always inserts the safe default role
    // ('revendedor'). The admin explicitly sets the real role here using
    // the service-role client so client-supplied metadata can never elevate.
    const createdId = created.user?.id;
    if (createdId && data.role !== "revendedor") {
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .update({ role: data.role })
        .eq("user_id", createdId);
      if (roleErr) throw new Error(roleErr.message);
    }
    return { id: createdId };
  });

const resetSchema = z.object({
  user_id: z.string().uuid(),
  password: z.string().min(6).max(72),
});

export const resetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => resetSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const deleteSchema = z.object({ user_id: z.string().uuid() });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    if (data.user_id === context.userId) {
      throw new Error("Você não pode excluir sua própria conta.");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

