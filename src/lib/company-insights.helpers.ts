import { z } from "zod";

export const companyIdSchema = z.object({ company_id: z.string().uuid() });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (data !== true) throw new Error("Acesso restrito ao Administrador Global.");
}
