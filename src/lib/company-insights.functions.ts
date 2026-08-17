import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idSchema = z.object({ company_id: z.string().uuid() });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (data !== true) throw new Error("Acesso restrito ao Administrador Global.");
}

/** Lista todas as empresas cadastradas (grade de perfis). Admin global apenas. */
export const listCompaniesGrid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, store_name, full_name, username, avatar_url, company_group_id")
      .is("parent_user_id", null)
      .order("store_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((p) => ({
      id: p.id as string,
      name: (p.store_name || p.full_name || "Sem nome") as string,
      username: (p.username ?? null) as string | null,
      avatar_url: (p.avatar_url ?? null) as string | null,
      is_branch: !!p.company_group_id,
    }));
  });

/** Detalhes avançados de uma empresa: dados comerciais, usuários, produtos e último login. */
export const getCompanyAdvancedDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, store_name, full_name, username, avatar_url, legal_name, document, document_type, state_registration, email, phone, whatsapp, cep, address, address_number, complement, neighborhood, city, state, created_at",
      )
      .eq("id", data.company_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Empresa não encontrada.");

    const { data: operators } = await supabaseAdmin
      .from("operators")
      .select("id, name, nickname, active, is_owner")
      .eq("owner_user_id", data.company_id)
      .order("is_owner", { ascending: false })
      .order("name", { ascending: true });

    const { count: productsCount } = await supabaseAdmin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("user_id", data.company_id);

    let lastSignInAt: string | null = null;
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.company_id);
      lastSignInAt = authUser?.user?.last_sign_in_at ?? null;
    } catch {
      lastSignInAt = null;
    }

    return {
      profile,
      users: (operators ?? []).map((o) => ({
        id: o.id as string,
        name: o.name as string,
        nickname: (o.nickname ?? null) as string | null,
        active: !!o.active,
        is_owner: !!o.is_owner,
      })),
      productsCount: productsCount ?? 0,
      lastSignInAt,
    };
  });
