import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes, scryptSync } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMAIL_DOMAIN = "totalmaxx.local";
const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Acesso restrito ao Administrador Global.");
}

const commercialSchema = z.object({
  document: z.string().trim().max(32).optional().nullable(),
  document_type: z.enum(["CPF", "CNPJ"]).optional().nullable(),
  razao_social: z.string().trim().max(160).optional().nullable(),
  email: z.string().trim().email("E-mail inválido.").max(160).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
  whatsapp: z.string().trim().max(40).optional().nullable(),
  cep: z.string().trim().max(16).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  address_number: z.string().trim().max(20).optional().nullable(),
  complement: z.string().trim().max(80).optional().nullable(),
  neighborhood: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(4).optional().nullable(),
});

const createSchema = z.object({
  owner_name: z.string().trim().min(1, "Informe o nome do proprietário.").max(120),
  store_name: z.string().trim().min(1, "Informe o nome da loja.").max(120),
  username: z
    .string()
    .trim()
    .min(3, "Usuário muito curto.")
    .max(40)
    .regex(/^[a-z0-9._-]+$/, "Use letras minúsculas, números, ponto, hífen ou underscore."),
  password: z.string().min(6, "Senha mínima de 6 caracteres.").max(72),
  pin: z.string().regex(/^\d{4,6}$/, "PIN deve conter 4 a 6 dígitos."),
  company_group_id: z.string().uuid().nullable().optional(),
  commercial: commercialSchema.optional(),
});

/**
 * Atomic creation of a company:
 *  1. auth.users (login principal)
 *  2. profiles (empresa + dados comerciais opcionais)
 *  3. operators (usuário interno "Proprietário" com PIN + permissões máximas)
 *  4. activity_logs
 * Rollback: on any failure after user creation, the auth user is deleted.
 */
export const createCompanyWithOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const username = data.username.toLowerCase();
    const ownerName = data.owner_name.trim().toUpperCase();
    const storeName = data.store_name.trim().toUpperCase();
    const email = usernameToEmail(username);

    // Uniqueness check up-front
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existing) throw new Error("Este nome de usuário já está em uso.");

    // Validate optional company group
    if (data.company_group_id) {
      const { data: parent } = await supabaseAdmin
        .from("profiles")
        .select("id, company_group_id")
        .eq("id", data.company_group_id)
        .maybeSingle();
      if (!parent) throw new Error("Empresa principal não encontrada.");
      if (parent.company_group_id) throw new Error("A empresa escolhida já é filial de outra.");
    }

    // 1. Create auth user
    const { data: created, error: userErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: ownerName, username },
    });
    if (userErr || !created?.user?.id) {
      throw new Error(userErr?.message ?? "Falha ao criar login da empresa.");
    }
    const companyId = created.user.id;

    try {
      // 2. Update profile with store info + commercial data
      const c = data.commercial ?? {};
      const profilePatch = {
        store_name: storeName,
        full_name: ownerName,
        company_group_id: data.company_group_id ?? null,
        ...(c.document ? { document: c.document } : {}),
        ...(c.document_type ? { document_type: c.document_type } : {}),
        ...(c.email ? { email: c.email } : {}),
        ...(c.phone ? { phone: c.phone } : {}),
        ...(c.cep ? { cep: c.cep } : {}),
        ...(c.address ? { address: c.address } : {}),
        ...(c.address_number ? { address_number: c.address_number } : {}),
        ...(c.city ? { city: c.city } : {}),
        ...(c.state ? { state: c.state } : {}),
      };

      const { error: profErr } = await supabaseAdmin
        .from("profiles")
        .update(profilePatch)
        .eq("id", companyId);
      if (profErr) throw new Error(profErr.message);

      // 3. Create owner operator with hashed PIN via SECURITY DEFINER helper
      const pinHash = hashPin(data.pin);
      const { error: rpcErr } = await supabaseAdmin.rpc("create_company_owner_operator", {
        _company_id: companyId,
        _owner_name: ownerName,
        _pin_hash: pinHash,
      });
      if (rpcErr) throw new Error(rpcErr.message);

      return { id: companyId };
    } catch (e) {
      // Rollback: delete the auth user (cascades to profiles/operators via FK)
      try {
        await supabaseAdmin.auth.admin.deleteUser(companyId);
      } catch {
        // best-effort
      }
      throw e instanceof Error ? e : new Error("Falha ao criar a empresa.");
    }
  });

/** Update commercial data of an existing company. Admin only. */
const updateCommercialSchema = z.object({
  company_id: z.string().uuid(),
  commercial: commercialSchema,
});

export const updateCompanyCommercial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateCommercialSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const c = data.commercial;
    const payload = {
      ...(c.document !== undefined ? { document: c.document } : {}),
      ...(c.document_type !== undefined ? { document_type: c.document_type } : {}),
      ...(c.email !== undefined ? { email: c.email } : {}),
      ...(c.phone !== undefined ? { phone: c.phone } : {}),
      ...(c.cep !== undefined ? { cep: c.cep } : {}),
      ...(c.address !== undefined ? { address: c.address } : {}),
      ...(c.address_number !== undefined ? { address_number: c.address_number } : {}),
      ...(c.city !== undefined ? { city: c.city } : {}),
      ...(c.state !== undefined ? { state: c.state } : {}),
    };
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(payload)
      .eq("id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
