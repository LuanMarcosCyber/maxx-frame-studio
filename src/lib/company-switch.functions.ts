import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listSwitchableCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_switchable_companies");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      full_name: string | null;
      store_name: string | null;
      avatar_url: string | null;
      is_active: boolean;
      is_self: boolean;
    }>;
  });

const switchSchema = z.object({ company_id: z.string().uuid() });

export const switchActiveCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => switchSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await context.supabase.rpc("switch_active_company", {
      _company_id: data.company_id,
    });
    if (error) throw new Error(error.message);
    return { active_company_id: result as string };
  });

export const clearActiveCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("clear_active_company");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
