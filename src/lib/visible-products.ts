import { supabase } from "@/integrations/supabase/client";

/**
 * A API de dados aplica um teto de linhas por requisição (padrão 1000), o que
 * truncava silenciosamente `list_visible_products` e fazia a contagem por
 * categoria mostrar menos produtos do que realmente existem.
 *
 * Aqui paginamos a RPC com `range()` até esgotar os registros, garantindo que
 * o cliente sempre receba 100% do catálogo visível.
 */
const PAGE_SIZE = 1000;

export async function fetchAllVisibleProducts(): Promise<
  Array<Record<string, unknown>>
> {
  const all: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc("list_visible_products")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}
