import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ActivityLogRow = {
  id: string;
  created_at: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  description: string | null;
  user_name: string | null;
  metadata: unknown;
};

/**
 * Lista o histórico do sistema. Exige a permissão "history" do usuário
 * interno ativo (proprietário passa sempre) — validado no servidor.
 */
export const listActivityLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActivityLogRow[]> => {
    const { assertOperatorPermission } = await import("@/lib/operator-guard.server");
    await assertOperatorPermission("history");

    const { data, error } = await (context.supabase.rpc as any)("list_activity_logs", {
      _limit: 500,
      _offset: 0,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as ActivityLogRow[];
  });
