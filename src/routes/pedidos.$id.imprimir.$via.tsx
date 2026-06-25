import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect } from "react";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pedidos/$id/imprimir/$via")({
  head: () => ({ meta: [{ title: "Imprimir pedido — Total Maxx ERP" }] }),
  component: PrintOrder,
});

type Variant = "loja" | "producao" | "cliente";

const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("pt-BR") : "—";
const fmtDateBR = (s: string | null | undefined) => {
  if (!s) return "—";
  // accept yyyy-mm-dd or ISO
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(s).toLocaleDateString("pt-BR");
};
const fmtMeasure = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

type ItemData = Record<string, unknown>;
type Parcela = { numero: number; valor: number; vencimento: string };

function dNum(d: ItemData, k: string) {
  const v = d[k];
  return typeof v === "number" ? v : Number(v) || 0;
}
function dStr(d: ItemData, k: string) {
  const v = d[k];
  return typeof v === "string" ? v : "";
}
function productLabel(d: ItemData, codeKey: string, descKey: string) {
  const c = dStr(d, codeKey);
  const dd = dStr(d, descKey);
  if (!c && !dd) return "—";
  return `${c}${c && dd ? " — " : ""}${dd}`;
}

function PrintOrder() {
  const { id, via } = Route.useParams();
  const variant: Variant =
    via === "producao" || via === "cliente" ? via : "loja";

  const { data, isLoading } = useQuery({
    queryKey: ["print", "order", id],
    queryFn: async () => {
      const { data: order, error: oErr } = await supabase
        .from("orders")
        .select("id, number, client_name, total_value, status, created_at, budget_id, user_id")
        .eq("id", id)
        .maybeSingle();
      if (oErr || !order) throw oErr ?? new Error("Pedido não encontrado");

      const [{ data: profile }, budgetRes, clientRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, store_name, phone, email, address, document")
          .eq("id", order.user_id)
          .maybeSingle(),
        order.budget_id
          ? supabase
              .from("budgets")
              .select("id, number, client_id, data_vencimento, details, total_value, created_at")
              .eq("id", order.budget_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        // client phone/email if available
        Promise.resolve({ data: null as any }),
      ]);

      const budget = (budgetRes as any).data ?? null;

      let items: Array<{ id: string; position: number; subtotal: number; data: ItemData }> = [];
      if (budget?.id) {
        const { data: bItems } = await supabase
          .from("budget_items")
          .select("id, position, subtotal, data")
          .eq("budget_id", budget.id)
          .order("position", { ascending: true });
        items = (bItems ?? []) as any;
        if (items.length === 0) {
          items = [{
            id: budget.id,
            position: 1,
            subtotal: Number(budget.total_value),
            data: (budget.details ?? {}) as ItemData,
          }];
        }
      }

      let client: any = null;
      if (budget?.client_id) {
        const { data: c } = await supabase
          .from("clients")
          .select("name, phone, email, document, address")
          .eq("id", budget.client_id)
          .maybeSingle();
        client = c;
      }

      return { order, profile, budget, items, client };
    },
  });

  useEffect(() => {
    if (!isLoading && data) {
      const t = setTimeout(() => window.print(), 350);
      return () => clearTimeout(t);
    }
  }, [isLoading, data]);

  if (isLoading) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
        Carregando pedido para impressão…
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
        Pedido não encontrado.
      </div>
    );
  }

  const { order, profile, budget, items, client } = data;
  const general: ItemData = (budget?.details ?? {}) as ItemData;
  const parcelas: Parcela[] = Array.isArray(general.parcelas)
    ? (general.parcelas as unknown[])
        .map((p, i) => {
          if (!p || typeof p !== "object") return null;
          const o = p as Record<string, unknown>;
          return {
            numero: typeof o.numero === "number" ? o.numero : i + 1,
            valor: typeof o.valor === "number" ? o.valor : Number(o.valor) || 0,
            vencimento: typeof o.vencimento === "string" ? o.vencimento : "",
          };
        })
        .filter((x): x is Parcela => !!x)
    : [];

  const condicao = dStr(general, "condicaoPagamento") || "À vista";
  const isParcelado = condicao === "Parcelado" && parcelas.length > 0;
  const forma = dStr(general, "formaPagamento") || "—";
  const dataEntrega = dStr(general, "dataEntrega")
    ? fmtDateBR(dStr(general, "dataEntrega"))
    : "—";
  const observacoes = dStr(general, "observacoes");
  const desconto = dNum(general, "descontoValor");
  const descontoPerc = dNum(general, "descontoPercentual");
  const sinalAtivo = general.sinalAtivo === "sim";
  const valorSinal = dNum(general, "valorSinal");
  const valorAReceber = dNum(general, "valorAReceber");
  const total = Number(order.total_value);

  const storeName = profile?.store_name || profile?.full_name || "Loja";
  const variantTitle =
    variant === "loja" ? "Via Loja" : variant === "producao" ? "Via Produção" : "Via Cliente";

  return (
    <>
      <style>{`
        @page { size: A4; margin: 14mm; }
        html, body { background: #f3f4f6; margin: 0; padding: 0; }
        body { font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #111827; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .sheet {
          width: 210mm;
          min-height: 297mm;
          padding: 14mm 14mm 18mm;
          margin: 16px auto;
          background: #fff;
          box-shadow: 0 2px 12px rgba(0,0,0,0.08);
          box-sizing: border-box;
        }
        .topbar { background:#7a1f2b; color:#fff; padding:10px 14px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; }
        .topbar h1 { margin:0; font-size:18px; letter-spacing:.5px; }
        .topbar small { opacity:.85; font-size:11px; text-transform:uppercase; letter-spacing:1px; }
        .brand-bar { height:4px; background:#7a1f2b; margin-top:14px; border-radius:2px; }
        h2.section { font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:#7a1f2b; margin:18px 0 6px; border-bottom:1px solid #e5e7eb; padding-bottom:4px; }
        .grid { display:grid; grid-template-columns: repeat(2,1fr); gap:6px 18px; font-size:12px; }
        .grid .lbl { color:#6b7280; font-size:10px; text-transform:uppercase; letter-spacing:.5px; }
        .grid .val { font-weight:600; }
        table.items { width:100%; border-collapse:collapse; font-size:11.5px; margin-top:6px; page-break-inside:auto; }
        table.items th, table.items td { padding:6px 8px; border-bottom:1px solid #e5e7eb; vertical-align:top; text-align:left; }
        table.items thead th { background:#fafafa; font-size:10px; text-transform:uppercase; color:#6b7280; letter-spacing:.5px; }
        table.items tbody tr { page-break-inside:avoid; }
        .totals { margin-top:10px; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden; }
        .totals .row { display:flex; justify-content:space-between; padding:7px 12px; font-size:12px; border-bottom:1px solid #f3f4f6; }
        .totals .row:last-child { border-bottom:none; }
        .totals .row.total { background:#7a1f2b; color:#fff; font-weight:700; font-size:14px; }
        .totals .row.muted { color:#6b7280; }
        .totals .row.due { background:#ecfdf5; color:#065f46; font-weight:700; }
        .obs { margin-top:10px; font-size:11.5px; white-space:pre-wrap; border:1px dashed #d1d5db; padding:8px 10px; border-radius:6px; background:#fafafa; }
        .item-block { margin-top:8px; border:1px solid #e5e7eb; border-radius:6px; padding:8px 10px; page-break-inside:avoid; }
        .item-block h3 { margin:0 0 4px; font-size:12px; color:#7a1f2b; }
        .item-rows { display:grid; grid-template-columns: 1fr auto; gap:2px 12px; font-size:11px; }
        .item-rows .k { color:#6b7280; }
        .footer { margin-top:18px; padding-top:8px; border-top:1px solid #e5e7eb; font-size:10px; color:#6b7280; text-align:center; }
        .print-actions { position:fixed; top:12px; right:12px; display:flex; gap:8px; }
        .print-actions button { background:#7a1f2b; color:#fff; border:none; border-radius:6px; padding:8px 14px; font-size:12px; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,.15); }
        .print-actions button.secondary { background:#fff; color:#111; border:1px solid #d1d5db; }
        @media print {
          html, body { background:#fff; }
          .sheet { box-shadow:none; margin:0; width:auto; min-height:auto; padding:0; }
          .print-actions { display:none; }
        }
      `}</style>

      <div className="print-actions">
        <button type="button" className="secondary" onClick={() => window.close()}>Fechar</button>
        <button type="button" onClick={() => window.print()}>Imprimir</button>
      </div>

      <div className="sheet">
        <div className="topbar">
          <div>
            <h1>{storeName}</h1>
            {variant !== "producao" && profile?.phone && (
              <small style={{ display: "block", marginTop: 2 }}>{profile.phone}</small>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <small>{variantTitle}</small>
            <div style={{ fontFamily: "monospace", fontSize: 16, marginTop: 2 }}>
              Pedido {order.number}
            </div>
          </div>
        </div>
        <div className="brand-bar" />

        <h2 className="section">Informações</h2>
        <div className="grid">
          <div>
            <div className="lbl">Cliente</div>
            <div className="val">{order.client_name || "—"}</div>
          </div>
          {budget && (
            <div>
              <div className="lbl">Orçamento origem</div>
              <div className="val" style={{ fontFamily: "monospace" }}>{budget.number}</div>
            </div>
          )}
          <div>
            <div className="lbl">Data do pedido</div>
            <div className="val">{fmtDate(order.created_at)}</div>
          </div>
          <div>
            <div className="lbl">Data de entrega</div>
            <div className="val">{dataEntrega}</div>
          </div>
          {variant !== "producao" && client && (
            <>
              {client.phone && (
                <div>
                  <div className="lbl">Telefone</div>
                  <div className="val">{client.phone}</div>
                </div>
              )}
              {client.email && (
                <div>
                  <div className="lbl">E-mail</div>
                  <div className="val">{client.email}</div>
                </div>
              )}
            </>
          )}
          {variant !== "producao" && (
            <>
              <div>
                <div className="lbl">Forma de pagamento</div>
                <div className="val">{forma}</div>
              </div>
              <div>
                <div className="lbl">Condição</div>
                <div className="val">
                  {isParcelado ? `Parcelado · ${parcelas.length}x` : condicao}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Itens */}
        <h2 className="section">Itens do pedido</h2>
        {variant === "producao" ? (
          items.map((it, idx) => {
            const d = it.data;
            const rows: Array<[string, string]> = [
              ["Tamanho original", `${fmtMeasure(dNum(d,"larguraOriginal"))} × ${fmtMeasure(dNum(d,"alturaOriginal"))} cm`],
              ["Tamanho final", `${fmtMeasure(dNum(d,"larguraFinal"))} × ${fmtMeasure(dNum(d,"alturaFinal"))} cm`],
            ];
            if (d.paspaturAtivo === "sim") {
              rows.push(["Paspatur externo", productLabel(d, "paspaturCode", "paspaturDescription")]);
              if (d.paspaturAdicionalAtivo === "sim") {
                rows.push(["Paspatur interno", productLabel(d, "paspaturAdicionalCode", "paspaturAdicionalDescription")]);
              }
            }
            const margens =
              `Esq ${fmtMeasure(dNum(d,"margemEsquerda"))} · Dir ${fmtMeasure(dNum(d,"margemDireita"))} · Sup ${fmtMeasure(dNum(d,"margemSuperior"))} · Inf ${fmtMeasure(dNum(d,"margemInferior"))} cm`;
            rows.push(["Margens", margens]);
            rows.push(["Perfil", productLabel(d, "perfilCode", "perfilDescription")]);
            if (d.perfilAdicionalAtivo === "sim") {
              rows.push(["Perfil adicional", productLabel(d, "perfilAdicionalCode", "perfilAdicionalDescription")]);
            }
            if (d.vidroTipo === "sim") {
              rows.push(["Vidro / Espelho", productLabel(d, "vidroCode", "vidroDescription")]);
            }
            rows.push(["Foam / MDF", productLabel(d, "foamCode", "foamDescription")]);
            if (d.colagemAtivo === "sim") {
              rows.push(["Colagem", productLabel(d, "colagemCode", "colagemDescription")]);
            }
            if (d.impressaoAtivo === "sim") {
              rows.push(["Impressão", productLabel(d, "impressaoCode", "impressaoDescription")]);
            }
            if (Array.isArray(d.produtosDiversos) && (d.produtosDiversos as unknown[]).length > 0) {
              (d.produtosDiversos as Array<Record<string, unknown>>).forEach((p) => {
                const code = typeof p.code === "string" ? p.code : "";
                const nome = typeof p.nome === "string" ? p.nome : "Produto";
                const qtd = Number(p.quantidade) || 1;
                rows.push(["Produto diverso", `${qtd}× ${code ? code + " · " : ""}${nome}`]);
              });
            }
            const itemObs = dStr(d, "observacoes");
            return (
              <div key={it.id} className="item-block">
                <h3>Item {idx + 1}</h3>
                <div className="item-rows">
                  {rows.map(([k, v], i) => (
                    <Fragment key={i}>
                      <div className="k">{k}</div>
                      <div>{v}</div>
                    </Fragment>
                  ))}

                </div>
                {itemObs && <div className="obs" style={{ marginTop: 6 }}>{itemObs}</div>}
              </div>
            );
          })
        ) : (
          <table className="items">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Descrição</th>
                <th style={{ width: 90 }}>Tamanho</th>
                {variant === "loja" && <th style={{ width: 90, textAlign: "right" }}>Subtotal</th>}
                {variant === "cliente" && <th style={{ width: 90, textAlign: "right" }}>Valor</th>}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "#6b7280" }}>Sem itens</td></tr>
              ) : items.map((it, idx) => {
                const d = it.data;
                const descParts: string[] = [];
                const perfil = productLabel(d, "perfilCode", "perfilDescription");
                if (perfil !== "—") descParts.push(`Perfil: ${perfil}`);
                if (d.paspaturAtivo === "sim") {
                  descParts.push(`Paspatur: ${productLabel(d, "paspaturCode", "paspaturDescription")}`);
                }
                if (d.vidroTipo === "sim") {
                  descParts.push(`Vidro: ${productLabel(d, "vidroCode", "vidroDescription")}`);
                }
                const tam = `${fmtMeasure(dNum(d,"larguraFinal"))} × ${fmtMeasure(dNum(d,"alturaFinal"))}`;
                return (
                  <tr key={it.id}>
                    <td>{idx + 1}</td>
                    <td>{descParts.join(" · ") || "Item de moldura"}</td>
                    <td>{tam}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtMoney(Number(it.subtotal))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Totais e pagamento */}
        {variant !== "producao" && (
          <>
            <h2 className="section">Valores</h2>
            <div className="totals">
              {variant === "loja" && dNum(general, "valorInstalacao") > 0 && (
                <div className="row muted"><span>Instalação</span><span>{fmtMoney(dNum(general,"valorInstalacao"))}</span></div>
              )}
              {variant === "loja" && dNum(general, "valorEntrega") > 0 && (
                <div className="row muted"><span>Entrega / Frete</span><span>{fmtMoney(dNum(general,"valorEntrega"))}</span></div>
              )}
              {variant === "loja" && dNum(general, "maoDeObraExtra") > 0 && (
                <div className="row muted"><span>Mão de obra extra</span><span>{fmtMoney(dNum(general,"maoDeObraExtra"))}</span></div>
              )}
              {descontoPerc > 0 && (
                <div className="row muted">
                  <span>Desconto ({descontoPerc}%)</span>
                  <span>- {fmtMoney(desconto)}</span>
                </div>
              )}
              <div className="row total"><span>Total</span><span>{fmtMoney(total)}</span></div>
              {sinalAtivo && valorSinal > 0 && (
                <>
                  <div className="row"><span>Sinal pago</span><span>{fmtMoney(valorSinal)}</span></div>
                  <div className="row due"><span>Valor a receber</span><span>{fmtMoney(valorAReceber)}</span></div>
                </>
              )}
            </div>

            {isParcelado && variant === "loja" && (
              <>
                <h2 className="section">Parcelas ({parcelas.length}x)</h2>
                <table className="items">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>#</th>
                      <th>Vencimento</th>
                      <th style={{ width: 110, textAlign: "right" }}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcelas.map((p) => (
                      <tr key={p.numero}>
                        <td>{p.numero}/{parcelas.length}</td>
                        <td>{p.vencimento ? fmtDateBR(p.vencimento) : "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtMoney(p.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}

        {observacoes && (
          <>
            <h2 className="section">Observações</h2>
            <div className="obs">{observacoes}</div>
          </>
        )}

        {variant === "cliente" && (profile?.address || profile?.phone || profile?.email) && (
          <>
            <h2 className="section">Dados da loja</h2>
            <div className="grid">
              {profile?.address && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div className="lbl">Endereço</div>
                  <div className="val">{profile.address}</div>
                </div>
              )}
              {profile?.phone && (
                <div>
                  <div className="lbl">Telefone</div>
                  <div className="val">{profile.phone}</div>
                </div>
              )}
              {profile?.email && (
                <div>
                  <div className="lbl">E-mail</div>
                  <div className="val">{profile.email}</div>
                </div>
              )}
            </div>
          </>
        )}

        <div className="footer">
          {storeName} · Pedido {order.number} · {variantTitle} · Emitido em {fmtDate(new Date().toISOString())}
        </div>
      </div>
    </>
  );
}
