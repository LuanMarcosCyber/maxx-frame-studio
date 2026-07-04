import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({ kind: z.enum(["budget", "order"]) });

export const nextDocumentNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: me, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, parent_user_id, active")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!me || me.active === false) throw new Error("Conta inativa ou não encontrada.");

    const { data: number, error } = await (supabaseAdmin.rpc as any)("next_document_number_for", {
      _caller: context.userId,
      _kind: data.kind,
    });

    if (!error) return String(number);

    const canFallback = /function .*next_document_number_for|schema cache|permission denied/i.test(error.message ?? "");
    if (!canFallback) throw new Error(error.message);

    const { data: legacyNumber, error: legacyError } = await supabaseAdmin.rpc("next_document_number", {
      _kind: data.kind,
    });
    if (legacyError) throw new Error(legacyError.message);
    return String(legacyNumber);
  });