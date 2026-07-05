import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_supabase";

export default defineTool({
  name: "list_products",
  title: "List products",
  description: "List products visible to the signed-in user, optionally filtered by code/description/category.",
  inputSchema: {
    search: z.string().trim().optional(),
    category: z.string().trim().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, category, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = supabaseForUser(ctx)
      .from("products")
      .select("id, code, description, category, value_per_meter, supplier, ncm, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (category) q = q.eq("category", category);
    if (search) q = q.or(`code.ilike.%${search}%,description.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { products: data ?? [] },
    };
  },
});
