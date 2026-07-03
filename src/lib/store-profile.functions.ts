import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({ user_id: z.string().uuid() });

type ProfileRow = {
  id: string;
  full_name: string | null;
  store_name: string | null;
  email: string | null;
  phone: string | null;
  document: string | null;
  document_type: string | null;
  cep: string | null;
  address: string | null;
  address_number: string | null;
  city: string | null;
  state: string | null;
  avatar_url: string | null;
  parent_user_id: string | null;
  account_type: string | null;
};

const STORE_COLUMNS =
  "id, full_name, store_name, email, phone, document, document_type, cep, address, address_number, city, state, avatar_url, parent_user_id, account_type";

async function profileById(supabaseAdmin: any, id: string): Promise<ProfileRow | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(STORE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProfileRow | null) ?? null;
}

async function hasRole(supabaseAdmin: any, userId: string, role: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

async function chainContains(supabaseAdmin: any, startId: string, ids: Set<string>): Promise<boolean> {
  let current: string | null = startId;
  const visited = new Set<string>();
  for (let i = 0; i < 10 && current && !visited.has(current); i += 1) {
    visited.add(current);
    const row = await profileById(supabaseAdmin, current);
    current = row?.parent_user_id ?? null;
    if (current && ids.has(current)) return true;
  }
  return false;
}

async function fallbackParentFromMetadata(supabaseAdmin: any, userId: string): Promise<string | null> {
  const isCollaborator = await hasRole(supabaseAdmin, userId, "colaborador");
  if (!isCollaborator) return null;

  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  const rawParent = data?.user?.user_metadata?.parent_user_id;
  if (typeof rawParent !== "string") return null;

  const parent = await profileById(supabaseAdmin, rawParent);
  return parent?.id ?? null;
}

export const getInheritedStoreProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const target = await profileById(supabaseAdmin, data.user_id);
    if (!target) throw new Error("Conta não encontrada.");

    const fallbackParent = target.parent_user_id ? null : await fallbackParentFromMetadata(supabaseAdmin, target.id);
    const storeId = target.parent_user_id ?? fallbackParent ?? target.id;

    const authorized =
      context.userId === target.id ||
      context.userId === storeId ||
      (await hasRole(supabaseAdmin, context.userId, "admin")) ||
      (await chainContains(supabaseAdmin, context.userId, new Set([target.id, storeId]))) ||
      (await chainContains(supabaseAdmin, target.id, new Set([context.userId])));

    if (!authorized) throw new Error("Acesso negado.");

    const store = await profileById(supabaseAdmin, storeId);
    if (!store) throw new Error("Conta principal não encontrada.");

    return {
      id: store.id,
      full_name: store.full_name,
      store_name: store.store_name,
      email: store.email,
      phone: store.phone,
      document: store.document,
      document_type: store.document_type,
      cep: store.cep,
      address: store.address,
      address_number: store.address_number,
      city: store.city,
      state: store.state,
      avatar_url: store.avatar_url,
    };
  });