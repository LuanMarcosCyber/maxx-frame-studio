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

    const ownerId = (me.parent_user_id as string | null) ?? context.userId;
    const prefix = data.kind === "budget" ? "ORC" : "PED";

    const { error: insertCounterError } = await supabaseAdmin
      .from("number_counters")
      .upsert(
        { owner_user_id: ownerId, kind: data.kind, last_value: 0 },
        { onConflict: "owner_user_id,kind", ignoreDuplicates: true },
      );
    if (insertCounterError) throw new Error(insertCounterError.message);

    const { data: current, error: counterError } = await supabaseAdmin
      .from("number_counters")
      .select("last_value")
      .eq("owner_user_id", ownerId)
      .eq("kind", data.kind)
      .maybeSingle();
    if (counterError) throw new Error(counterError.message);

    let next = Number(current?.last_value ?? 0);
    if (next === 0) {
      const table = data.kind === "budget" ? "budgets" : "orders";
      const { data: existingRows, error: existingError } = await supabaseAdmin
        .from(table)
        .select("number")
        .eq("user_id", ownerId);
      if (existingError) throw new Error(existingError.message);
      next = Math.max(
        0,
        ...((existingRows ?? []) as { number: string | null }[]).map((row) => {
          const match = String(row.number ?? "").match(new RegExp(`^${prefix}-(\\d+)$`));
          return match ? Number(match[1]) : 0;
        }),
      );
    }

    next += 1;
    const { error: updateError } = await supabaseAdmin
      .from("number_counters")
      .update({ last_value: next, updated_at: new Date().toISOString() })
      .eq("owner_user_id", ownerId)
      .eq("kind", data.kind);
    if (updateError) throw new Error(updateError.message);

    return `${prefix}-${String(next).padStart(6, "0")}`;
  });