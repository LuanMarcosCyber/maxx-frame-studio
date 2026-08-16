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
  legal_name: z.string().trim().max(200).optional().nullable(),
  trade_name: z.string().trim().max(200).optional().nullable(),
  state_registration: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email("E-mail inválido.").max(160).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
  whatsapp: z.string().trim().max(40).optional().nullable(),
  cep: z.string().trim().max(16).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  address_number: z.string().trim().max(20).optional().nullable(),
  complement: z.string().trim().max(120).optional().nullable(),
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
        ...(c.legal_name ? { legal_name: c.legal_name } : {}),
        ...(c.trade_name ? { store_name: c.trade_name } : {}),
        ...(c.state_registration ? { state_registration: c.state_registration } : {}),
        ...(c.email ? { email: c.email } : {}),
        ...(c.phone ? { phone: c.phone } : {}),
        ...(c.whatsapp ? { whatsapp: c.whatsapp } : {}),
        ...(c.cep ? { cep: c.cep } : {}),
        ...(c.address ? { address: c.address } : {}),
        ...(c.address_number ? { address_number: c.address_number } : {}),
        ...(c.complement ? { complement: c.complement } : {}),
        ...(c.neighborhood ? { neighborhood: c.neighborhood } : {}),
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
      ...(c.legal_name !== undefined ? { legal_name: c.legal_name } : {}),
      ...(c.trade_name !== undefined ? { store_name: c.trade_name } : {}),
      ...(c.state_registration !== undefined ? { state_registration: c.state_registration } : {}),
      ...(c.email !== undefined ? { email: c.email } : {}),
      ...(c.phone !== undefined ? { phone: c.phone } : {}),
      ...(c.whatsapp !== undefined ? { whatsapp: c.whatsapp } : {}),
      ...(c.cep !== undefined ? { cep: c.cep } : {}),
      ...(c.address !== undefined ? { address: c.address } : {}),
      ...(c.address_number !== undefined ? { address_number: c.address_number } : {}),
      ...(c.complement !== undefined ? { complement: c.complement } : {}),
      ...(c.neighborhood !== undefined ? { neighborhood: c.neighborhood } : {}),
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

/** Full company details for the admin edit modal. */
const idSchema = z.object({ company_id: z.string().uuid() });

export const getCompanyDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, full_name, store_name, username, company_group_id, document, document_type, legal_name, state_registration, email, phone, whatsapp, cep, address, address_number, complement, neighborhood, city, state",
      )
      .eq("id", data.company_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Empresa não encontrada.");
    return p;
  });

const updateSchema = z.object({
  company_id: z.string().uuid(),
  owner_name: z.string().trim().min(1, "Informe o nome do proprietário.").max(120),
  store_name: z.string().trim().min(1, "Informe o nome da loja.").max(120),
  username: z
    .string()
    .trim()
    .min(3, "Usuário muito curto.")
    .max(40)
    .regex(/^[a-z0-9._-]+$/, "Use letras minúsculas, números, ponto, hífen ou underscore."),
  password: z.string().min(6, "Senha mínima de 6 caracteres.").max(72).optional().nullable(),
  pin: z.string().regex(/^\d{4,6}$/, "PIN deve conter 4 a 6 dígitos.").optional().nullable(),
  company_group_id: z.string().uuid().nullable().optional(),
  commercial: commercialSchema.optional(),
});

/** Update every company field (admin only). Reflects changes on the login account. */
export const updateCompanyFull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const companyId = data.company_id;
    const username = data.username.toLowerCase();
    const ownerName = data.owner_name.trim().toUpperCase();
    const storeName = data.store_name.trim().toUpperCase();

    const { data: current } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .eq("id", companyId)
      .maybeSingle();
    if (!current) throw new Error("Empresa não encontrada.");

    if (username !== (current.username ?? "")) {
      const { data: taken } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", companyId)
        .maybeSingle();
      if (taken) throw new Error("Este nome de usuário já está em uso.");
    }

    if (data.company_group_id) {
      if (data.company_group_id === companyId) throw new Error("A empresa não pode ser filial dela mesma.");
      const { data: parent } = await supabaseAdmin
        .from("profiles")
        .select("id, company_group_id")
        .eq("id", data.company_group_id)
        .maybeSingle();
      if (!parent) throw new Error("Empresa principal não encontrada.");
      if (parent.company_group_id) throw new Error("A empresa escolhida já é filial de outra.");
    }

    // Login account (auth.users): email derived from username + optional password
    const authPatch: { email?: string; password?: string; user_metadata?: Record<string, unknown> } = {
      user_metadata: { full_name: ownerName, username },
    };
    if (username !== (current.username ?? "")) authPatch.email = usernameToEmail(username);
    if (data.password) authPatch.password = data.password;
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(companyId, authPatch);
    if (authErr) throw new Error(authErr.message);

    const c = data.commercial ?? {};
    const patch = {
      full_name: ownerName,
      store_name: c.trade_name ? c.trade_name.toUpperCase() : storeName,
      username,
      company_group_id: data.company_group_id ?? null,
      document: c.document ?? null,
      document_type: c.document_type ?? null,
      legal_name: c.legal_name ?? null,
      state_registration: c.state_registration ?? null,
      email: c.email || null,
      phone: c.phone ?? null,
      whatsapp: c.whatsapp ?? null,
      cep: c.cep ?? null,
      address: c.address ?? null,
      address_number: c.address_number ?? null,
      complement: c.complement ?? null,
      neighborhood: c.neighborhood ?? null,
      city: c.city ?? null,
      state: c.state ?? null,
    };
    const { error: profErr } = await supabaseAdmin.from("profiles").update(patch).eq("id", companyId);
    if (profErr) throw new Error(profErr.message);

    // Owner internal user: name always, PIN only when informed
    const ownerPatch = {
      name: ownerName,
      ...(data.pin ? { pin_hash: hashPin(data.pin) } : {}),
    };
    const { error: opErr } = await supabaseAdmin
      .from("operators")
      .update(ownerPatch)
      .eq("owner_user_id", companyId)
      .eq("is_owner", true);
    if (opErr) throw new Error(opErr.message);

    return { ok: true };
  });
