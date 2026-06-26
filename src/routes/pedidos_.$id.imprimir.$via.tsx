import { createFileRoute } from "@tanstack/react-router";
import { PrintDocument } from "@/lib/print-document";

export const Route = createFileRoute("/pedidos_/$id/imprimir/$via")({
  head: () => ({ meta: [{ title: "Imprimir pedido — Total Maxx ERP" }] }),
  component: PrintOrder,
});

function PrintOrder() {
  const { id, via } = Route.useParams();
  return <PrintDocument kind="pedido" id={id} via={via} />;
}
