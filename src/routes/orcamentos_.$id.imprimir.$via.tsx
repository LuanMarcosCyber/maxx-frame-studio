import { createFileRoute } from "@tanstack/react-router";
import { PrintDocument } from "@/lib/print-document";

export const Route = createFileRoute("/orcamentos_/$id/imprimir/$via")({
  head: () => ({ meta: [{ title: "Imprimir orçamento — Total Maxx ERP" }] }),
  component: PrintBudget,
});

function PrintBudget() {
  const { id, via } = Route.useParams();
  return <PrintDocument kind="orcamento" id={id} via={via} />;
}
