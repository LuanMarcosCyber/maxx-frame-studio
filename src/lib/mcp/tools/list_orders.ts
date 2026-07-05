import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_supabase";

export default defineTool({
  name: "list_orders",
  title: "List orders (pedidos)",
  description: "List orders visible to the signed-in user, with optional status filter and date range (ISO YYYY-MM-DD).",
  inputSchema: {
    status: z.string().trim().optional(),
    from: z.string().trim().optional().describe("Include orders created on/after this ISO date."),
    to: z.string().trim().optional().describe("Include orders created on/before this ISO date."),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, from, to, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = supabaseForUser(ctx)
      .from("orders")
      .select("id, number, client_name, total_value, status, created_at, budget_id")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (status) q = q.eq("status", status);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { orders: data ?? [] },
    };
  },
});
