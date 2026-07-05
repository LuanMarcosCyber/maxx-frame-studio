import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listClients from "./tools/list_clients";
import listProducts from "./tools/list_products";
import listOrders from "./tools/list_orders";
import listBudgets from "./tools/list_budgets";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "total-maxx-mcp",
  title: "Total Maxx ERP",
  version: "0.1.0",
  instructions:
    "Read-only access to the signed-in user's Total Maxx ERP data: clients, products, budgets (orçamentos) and orders (pedidos). All results respect the user's permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listClients, listProducts, listOrders, listBudgets],
});
