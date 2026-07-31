/**
 * Fonte única de verdade Produto → Fornecedor para TODOS os relatórios.
 *
 * Um produto pode vir de duas origens:
 *  - `products` (catálogo próprio da empresa) → fornecedor por `supplier_id`
 *    (relação com `suppliers`) ou, como legado, pelo texto livre `supplier`.
 *  - `global_supplier_products` (catálogo global) → fornecedor sempre por
 *    `supplier_id`.
 *
 * Antes os relatórios liam apenas `products.supplier`, então itens do catálogo
 * global (e produtos com apenas `supplier_id`) apareciam como "—".
 */

export type ProductMeta = {
  code: string;
  description: string;
  category: string;
  supplier: string;
};

export type ProductLookup = {
  /** id do produto (próprio ou global) → metadados resolvidos */
  map: Map<string, ProductMeta>;
  /** nomes de fornecedores distintos encontrados, ordenados */
  supplierNames: string[];
  /** categorias distintas, ordenadas */
  categories: string[];
  /** opções id/label para filtros */
  options: { id: string; label: string }[];
};

function supplierDisplayName(s: {
  trade_name: string | null;
  legal_name: string | null;
}): string {
  return (s.trade_name?.trim() || s.legal_name?.trim() || "").trim();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function buildProductLookup(client: any): Promise<ProductLookup> {
  const [ownRes, globalRes, supRes] = await Promise.all([
    client
      .from("products")
      .select("id, code, description, category, supplier, supplier_id")
      .order("description"),
    client
      .from("global_supplier_products")
      .select("id, code, description, category, supplier_id, active"),
    client.from("suppliers").select("id, legal_name, trade_name"),
  ]);

  const supplierById = new Map<string, string>();
  for (const s of (supRes?.data ?? []) as Array<{
    id: string;
    legal_name: string | null;
    trade_name: string | null;
  }>) {
    const name = supplierDisplayName(s);
    if (name) supplierById.set(s.id, name);
  }

  const map = new Map<string, ProductMeta>();
  const supplierSet = new Set<string>();
  const categorySet = new Set<string>();
  const options: { id: string; label: string }[] = [];

  const push = (
    id: string,
    code: string,
    description: string,
    category: string,
    supplier: string,
  ) => {
    const cat = (category ?? "").trim();
    const sup = (supplier ?? "").trim();
    map.set(id, {
      code: code ?? "",
      description: description ?? "",
      category: cat || "—",
      supplier: sup || "—",
    });
    if (sup) supplierSet.add(sup);
    if (cat) categorySet.add(cat);
    options.push({
      id,
      label: `${code ? code + " - " : ""}${description ?? ""}`.trim(),
    });
  };

  // Catálogo global primeiro; produtos próprios podem sobrescrever (override).
  for (const g of (globalRes?.data ?? []) as Array<{
    id: string;
    code: string | null;
    description: string | null;
    category: string | null;
    supplier_id: string | null;
    active?: boolean | null;
  }>) {
    push(
      g.id,
      g.code ?? "",
      g.description ?? "",
      g.category ?? "",
      (g.supplier_id ? supplierById.get(g.supplier_id) : "") ?? "",
    );
  }

  for (const p of (ownRes?.data ?? []) as Array<{
    id: string;
    code: string | null;
    description: string | null;
    category: string | null;
    supplier: string | null;
    supplier_id: string | null;
  }>) {
    const linked = p.supplier_id ? supplierById.get(p.supplier_id) : "";
    push(
      p.id,
      p.code ?? "",
      p.description ?? "",
      p.category ?? "",
      (linked || p.supplier || "").trim(),
    );
  }

  return {
    map,
    supplierNames: Array.from(supplierSet).sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    ),
    categories: Array.from(categorySet).sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    ),
    options: options.sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
  };
}
