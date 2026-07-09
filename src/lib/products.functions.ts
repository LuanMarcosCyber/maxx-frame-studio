import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const bulkDeleteProductsByCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        category: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const PAGE = 500;
    const DIRECT_REF_COLUMNS = [
      "product_id",
      "produto_id",
      "perfil_id",
      "perfil_adicional_id",
      "vidro_id",
      "foam_id",
      "paspatur_id",
      "paspatur_adicional_id",
      "colagem_id",
      "impressao_id",
    ];
    const OPTIONAL_LINK_TABLES = [
      "budget_items",
      "order_items",
      "budget_item_components",
      "order_item_components",
      "budget_components",
      "order_components",
      "orcamento_items",
      "pedido_items",
      "orcamento_componentes",
      "pedido_componentes",
    ];
    const JSON_REF_FIELDS = new Set([
      "productId",
      "produtoId",
      "produto_id",
      "idProduto",
      "perfilId",
      "perfilAdicionalId",
      "paspaturId",
      "paspaturAdicionalId",
      "vidroId",
      "foamId",
      "colagemId",
      "impressaoId",
    ]);

    const chunk = <T,>(items: T[], size = 200) => {
      const chunks: T[][] = [];
      for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
      return chunks;
    };
    const isMissingSchemaError = (message: string) =>
      /schema cache|could not find|does not exist|column .* not found|column .* does not exist|relation .* does not exist/i.test(
        message,
      );
    const hasProductReference = (value: unknown, productIds: Set<string>): boolean => {
      if (Array.isArray(value)) return value.some((entry) => hasProductReference(entry, productIds));
      if (!value || typeof value !== "object") return false;
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (JSON_REF_FIELDS.has(key) && productIds.has(String(entry ?? ""))) return true;
        if (entry && typeof entry === "object" && hasProductReference(entry, productIds)) return true;
      }
      return false;
    };
    const scrubProductReferences = (value: unknown, productIds: Set<string>): unknown => {
      if (Array.isArray(value)) return value.map((entry) => scrubProductReferences(entry, productIds));
      if (!value || typeof value !== "object") return value;
      const next: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (JSON_REF_FIELDS.has(key) && productIds.has(String(entry ?? ""))) {
          next[key] = "";
        } else if (entry && typeof entry === "object") {
          next[key] = scrubProductReferences(entry, productIds);
        } else {
          next[key] = entry;
        }
      }
      return next;
    };
    const formatDeleteError = (message: string) => {
      const relation = message.match(/table "([^"]+)"/i)?.[1] ?? message.match(/relation "([^"]+)"/i)?.[1];
      return relation
        ? `Ainda existe vínculo na tabela ${relation}. Motivo: ${message}`
        : message;
    };

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, active, parent_user_id, can_create_products, account_type")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile || profile.active === false) throw new Error("Conta inativa ou não encontrada.");

    const { data: roles, error: rolesError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesError) throw new Error(rolesError.message);
    const roleSet = new Set((roles ?? []).map((row: { role: string }) => row.role));
    const isAdmin = roleSet.has("admin") || profile.account_type === "admin";
    const isRevendedor = roleSet.has("revendedor") || profile.account_type === "revendedor";
    const isColaborador = roleSet.has("colaborador") || !!profile.parent_user_id;
    if (!(isAdmin || isRevendedor || (isColaborador && profile.can_create_products))) {
      throw new Error("Você não tem permissão para excluir produtos.");
    }

    const { data: ownerId, error: ownerError } = await admin.rpc("owner_user_id", {
      _user_id: context.userId,
    });
    if (ownerError) throw new Error(ownerError.message);
    if (!ownerId) throw new Error("Não foi possível identificar a empresa atual.");

    const { data: groupOwnerRows, error: groupError } = await admin.rpc("company_group_owner_ids", {
      _owner: ownerId,
    });
    if (groupError) throw new Error(groupError.message);
    const groupOwnerIds = (groupOwnerRows ?? []).map((row: unknown) =>
      typeof row === "string" ? row : String((row as { company_group_owner_ids?: string })?.company_group_owner_ids ?? ""),
    );
    const ownerScopeIds = Array.from(new Set([ownerId, ...groupOwnerIds].filter(Boolean)));

    const { data: collaboratorRows, error: collaboratorsError } = ownerScopeIds.length
      ? await admin.from("profiles").select("id").in("parent_user_id", ownerScopeIds)
      : { data: [], error: null };
    if (collaboratorsError) throw new Error(collaboratorsError.message);
    const scopeUserIds = Array.from(
      new Set([
        context.userId,
        ...ownerScopeIds,
        ...((collaboratorRows ?? []).map((row: { id: string }) => row.id)),
      ].filter(Boolean)),
    );

    // Gather product ids from BOTH the user-scoped view (RLS, matches what the
    // UI shows the user) and the owner/group scope via admin. Union both so we
    // never leave behind products the user can see or that belong to the group.
    const productIdSetAll = new Set<string>();
    for (let from = 0; ; from += PAGE) {
      const { data: rows, error } = await context.supabase
        .from("products")
        .select("id")
        .eq("category", data.category)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const pageRows = (rows ?? []) as Array<{ id: string }>;
      for (const row of pageRows) productIdSetAll.add(row.id);
      if (pageRows.length < PAGE) break;
    }
    for (let from = 0; ; from += PAGE) {
      const { data: rows, error } = await admin
        .from("products")
        .select("id")
        .eq("category", data.category)
        .in("user_id", scopeUserIds)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const pageRows = (rows ?? []) as Array<{ id: string }>;
      for (const row of pageRows) productIdSetAll.add(row.id);
      if (pageRows.length < PAGE) break;
    }
    const productIds: string[] = Array.from(productIdSetAll);


    if (productIds.length === 0) {
      return {
        found: 0,
        deleted: 0,
        cleanedBudgetItems: 0,
        cleanedBudgets: 0,
        deletedLinkedRows: 0,
      };
    }

    const productIdSet = new Set(productIds);
    const budgetItemUpdates: Array<{ id: string; data: unknown }> = [];
    const orphanBudgetItemIds: string[] = [];

    for (let from = 0; ; from += PAGE) {
      const { data: rows, error } = await admin
        .from("budget_items")
        .select("id, budget_id, data")
        .in("user_id", scopeUserIds)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const pageRows = (rows ?? []) as Array<{ id: string; budget_id: string; data: unknown }>;
      if (pageRows.length === 0) break;

      const budgetIds = Array.from(new Set(pageRows.map((row) => row.budget_id).filter(Boolean)));
      const existingBudgetIds = new Set<string>();
      for (const ids of chunk(budgetIds)) {
        const { data: budgets, error: budgetsError } = await admin.from("budgets").select("id").in("id", ids);
        if (budgetsError) throw new Error(budgetsError.message);
        for (const budget of budgets ?? []) existingBudgetIds.add((budget as { id: string }).id);
      }

      for (const row of pageRows) {
        if (!hasProductReference(row.data, productIdSet)) continue;
        if (!existingBudgetIds.has(row.budget_id)) {
          orphanBudgetItemIds.push(row.id);
        } else {
          budgetItemUpdates.push({ id: row.id, data: scrubProductReferences(row.data, productIdSet) });
        }
      }
      if (pageRows.length < PAGE) break;
    }

    let cleanedBudgetItems = 0;
    for (const ids of chunk(orphanBudgetItemIds)) {
      const { error, count } = await admin.from("budget_items").delete({ count: "exact" }).in("id", ids);
      if (error) throw new Error(error.message);
      cleanedBudgetItems += count ?? ids.length;
    }
    for (const row of budgetItemUpdates) {
      const { error } = await admin.from("budget_items").update({ data: row.data }).eq("id", row.id);
      if (error) throw new Error(error.message);
      cleanedBudgetItems += 1;
    }

    let cleanedBudgets = 0;
    for (let from = 0; ; from += PAGE) {
      const { data: rows, error } = await admin
        .from("budgets")
        .select("id, details")
        .in("user_id", scopeUserIds)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const pageRows = (rows ?? []) as Array<{ id: string; details: unknown }>;
      if (pageRows.length === 0) break;
      for (const row of pageRows) {
        if (!hasProductReference(row.details, productIdSet)) continue;
        const { error: updateError } = await admin
          .from("budgets")
          .update({ details: scrubProductReferences(row.details, productIdSet) })
          .eq("id", row.id);
        if (updateError) throw new Error(updateError.message);
        cleanedBudgets += 1;
      }
      if (pageRows.length < PAGE) break;
    }

    let deletedLinkedRows = 0;
    for (const table of OPTIONAL_LINK_TABLES) {
      for (const column of DIRECT_REF_COLUMNS) {
        for (const ids of chunk(productIds)) {
          const { error, count } = await admin.from(table).delete({ count: "exact" }).in(column, ids);
          if (error) {
            if (isMissingSchemaError(error.message ?? "")) continue;
            throw new Error(`Não foi possível limpar vínculo em ${table}.${column}: ${error.message}`);
          }
          deletedLinkedRows += count ?? 0;
        }
      }
    }

    let deleted = 0;
    for (const ids of chunk(productIds)) {
      const { error, count } = await admin.from("products").delete({ count: "exact" }).in("id", ids);
      if (error) throw new Error(formatDeleteError(error.message));
      deleted += count ?? ids.length;
    }

    const { count: remaining, error: remainingError } = await admin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("category", data.category)
      .in("user_id", scopeUserIds);
    if (remainingError) throw new Error(remainingError.message);
    if ((remaining ?? 0) > 0) {
      throw new Error(`Ainda restaram ${remaining} produto(s) na categoria após a exclusão.`);
    }

    return {
      found: productIds.length,
      deleted,
      cleanedBudgetItems,
      cleanedBudgets,
      deletedLinkedRows,
    };
  });