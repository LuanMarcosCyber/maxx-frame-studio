import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_supabase";

export default defineTool({
  name: "list_clients",
  title: "List clients",
  description: "List clients visible to the signed-in user, optionally filtered by name/email/document.",
  inputSchema: {
    search: z.string().trim().optional().describe("Optional case-insensitive search on name, email or document."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = supabaseForUser(ctx)
      .from("clients")
      .select("id, name, email, mobile_phone, commercial_phone, document, city, state, created_at")
      .order("name")
      .limit(limit ?? 50);
    if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,document.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { clients: data ?? [] },
    };
  },
});
