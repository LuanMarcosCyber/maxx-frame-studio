import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pedidos_/$id/imprimir/$via")({
  head: () => ({ meta: [{ title: "Imprimir pedido — Total Maxx ERP" }] }),
  component: PrintOrder,
});

type Variant = "loja" | "producao" | "cliente";
type ItemData = Record<string, unknown>;
type Parcela = { numero: number; valor: number; vencimento: string };
type Diverso = {
  code?: string;
  nome: string;
  descricao?: string;
  fornecedor?: string;
  quantidade: number;
  valorTotal: number;
};

const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("pt-BR") : "—";
const fmtDateBR = (s: string | null | undefined) => {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(s).toLocaleDateString("pt-BR");
};
const fmtM = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const dNum = (d: ItemData, k: string) => {
  const v = d[k];
  return typeof v === "number" ? v : Number(v) || 0;
};
const dStr = (d: ItemData, k: string) => {
  const v = d[k];
  return typeof v === "string" ? v : "";
};
const productLabel = (d: ItemData, codeKey: string, descKey: string) => {
  const c = dStr(d, codeKey);
  const dd = dStr(d, descKey);
  if (!c && !dd) return "—";
  return `${c}${c && dd ? " — " : ""}${dd}`;
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "·";
}

/** Visual SVG preview of the frame for the production sheet. */
function FramePreview({ d }: { d: ItemData }) {
  const W = dNum(d, "larguraFinal");
  const H = dNum(d, "alturaFinal");
  if (!W || !H) return null;

  const mE = dNum(d, "margemEsq");
  const mD = dNum(d, "margemDir");
  const mS = dNum(d, "margemSup");
  const mI = dNum(d, "margemInf");
  const hasExt = dStr(d, "paspaturAtivo") === "sim" && (mE || mD || mS || mI);

  const aE = dNum(d, "paspaturAdicionalEsq");
  const aD = dNum(d, "paspaturAdicionalDir");
  const aS = dNum(d, "paspaturAdicionalSup");
  const aI = dNum(d, "paspaturAdicionalInf");
  const hasInt = dStr(d, "paspaturAdicionalAtivo") === "sim" && (aE || aD || aS || aI);

  // SVG units == cm. Scale by viewBox.
  const pad = 14; // for labels (in cm-space)
  const vbW = W + pad * 2;
  const vbH = H + pad * 2;

  const x0 = pad, y0 = pad;
  // External paspatur frame is the outer rect; art inside the external margins.
  const extX = x0 + mE, extY = y0 + mS;
  const extW = W - mE - mD, extH = H - mS - mI;
  // Internal paspatur sits inside external
  const intX = extX + aE, intY = extY + aS;
  const intW = extW - aE - aD, intH = extH - aS - aI;

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      className="frame-preview"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* outer dim labels */}
      <text x={pad + W / 2} y={pad - 4} textAnchor="middle" fontSize="5">{fmtM(W)} cm</text>
      <text x={pad - 4} y={pad + H / 2} textAnchor="middle" fontSize="5"
        transform={`rotate(-90 ${pad - 4} ${pad + H / 2})`}>{fmtM(H)} cm</text>

      {/* outer frame (perfil) */}
      <rect x={x0} y={y0} width={W} height={H} fill="#fff" stroke="#111" strokeWidth="0.6" />

      {hasExt && (
        <rect x={extX} y={extY} width={extW} height={extH}
          fill="none" stroke="#111" strokeWidth="0.35" />
      )}
      {hasInt && intW > 0 && intH > 0 && (
        <rect x={intX} y={intY} width={intW} height={intH}
          fill="none" stroke="#111" strokeWidth="0.35" />
      )}

      {/* art label */}
      {intW > 0 && intH > 0 && (
        <text x={intX + intW / 2} y={intY + intH / 2} textAnchor="middle"
          dominantBaseline="middle" fontSize="5" fill="#555">
          ARTE {fmtM(intW)}×{fmtM(intH)}
        </text>
      )}

      {/* margin labels (only show when present) */}
      {hasExt && mS > 0 && (
        <text x={extX + extW / 2} y={extY - 1.2} textAnchor="middle" fontSize="3.4" fill="#555">
          {fmtM(mS)} cm
        </text>
      )}
      {hasExt && mI > 0 && (
        <text x={extX + extW / 2} y={extY + extH + 3.6} textAnchor="middle" fontSize="3.4" fill="#555">
          {fmtM(mI)} cm
        </text>
      )}
      {hasExt && mE > 0 && (
        <text x={extX - 1.2} y={extY + extH / 2} textAnchor="end" dominantBaseline="middle" fontSize="3.4" fill="#555">
          {fmtM(mE)}
        </text>
      )}
      {hasExt && mD > 0 && (
        <text x={extX + extW + 1.2} y={extY + extH / 2} textAnchor="start" dominantBaseline="middle" fontSize="3.4" fill="#555">
          {fmtM(mD)}
        </text>
      )}
    </svg>
  );
}

function extractDiversos(items: Array<{ data: ItemData }>): Diverso[] {
  const out: Diverso[] = [];
  for (const it of items) {
    const raw = it.data.produtosDiversos;
    if (!Array.isArray(raw)) continue;
    for (const p of raw as Array<Record<string, unknown>>) {
      const qtd = Number(p.quantidade) || 1;
      const valorUnit = Number(p.valor) || Number(p.preco) || 0;
      const valorTotal = Number(p.valorTotal) || valorUnit * qtd;
      out.push({
        code: typeof p.code === "string" ? p.code : undefined,
        nome: typeof p.nome === "string" ? p.nome : (typeof p.descricao === "string" ? p.descricao : "Produto"),
        descricao: typeof p.descricao === "string" ? p.descricao : undefined,
        fornecedor: typeof p.fornecedor === "string" ? p.fornecedor : undefined,
        quantidade: qtd,
        valorTotal,
      });
    }
  }
  return out;
}

function frameItemRows(d: ItemData): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const aoX = fmtM(dNum(d, "larguraOriginal"));
  const aoY = fmtM(dNum(d, "alturaOriginal"));
  const fX = fmtM(dNum(d, "larguraFinal"));
  const fY = fmtM(dNum(d, "alturaFinal"));
  rows.push(["Arte (sem paspatur)", `${aoX} x ${aoY} cm`]);
  rows.push(["Medida final", `${fX} x ${fY} cm`]);

  if (dStr(d, "paspaturAtivo") === "sim") {
    rows.push(["Paspatur externo", productLabel(d, "paspaturCode", "paspaturDescription")]);
    rows.push(["Margens (Paspatur Externo)",
      `Sup ${fmtM(dNum(d,"margemSup"))} cm | Inf ${fmtM(dNum(d,"margemInf"))} cm | Esq ${fmtM(dNum(d,"margemEsq"))} cm | Dir ${fmtM(dNum(d,"margemDir"))} cm`]);
    if (dStr(d, "paspaturAdicionalAtivo") === "sim") {
      rows.push(["Paspatur interno", productLabel(d, "paspaturAdicionalCode", "paspaturAdicionalDescription")]);
      rows.push(["Margens (Paspatur Interno)",
        `Sup ${fmtM(dNum(d,"paspaturAdicionalSup"))} cm | Inf ${fmtM(dNum(d,"paspaturAdicionalInf"))} cm | Esq ${fmtM(dNum(d,"paspaturAdicionalEsq"))} cm | Dir ${fmtM(dNum(d,"paspaturAdicionalDir"))} cm`]);
    }
  }
  rows.push(["Perfil", productLabel(d, "perfilCode", "perfilDescription")]);
  if (dStr(d, "perfilAdicionalAtivo") === "sim") {
    rows.push(["Perfil adicional", productLabel(d, "perfilAdicionalCode", "perfilAdicionalDescription")]);
  }
  rows.push(["Vidro / Espelho",
    dStr(d, "vidroTipo") === "sim" ? productLabel(d, "vidroCode", "vidroDescription") : "Não aplicado"]);
  rows.push(["Foam / MDF", productLabel(d, "foamCode", "foamDescription")]);
  rows.push(["Colagem",
    dStr(d, "colagemAtivo") === "sim" ? productLabel(d, "colagemCode", "colagemDescription") : "Colagem simples"]);
  rows.push(["Impressão",
    dStr(d, "impressaoAtivo") === "sim" ? productLabel(d, "impressaoCode", "impressaoDescription") : "Não aplicada"]);
  return rows;
}

function PrintOrder() {
  const { id, via } = Route.useParams();
  const variant: Variant = via === "producao" || via === "cliente" ? via : "loja";

  const { data, isLoading } = useQuery({
    queryKey: ["print", "order", id],
    queryFn: async () => {
      const { data: order, error: oErr } = await supabase
        .from("orders")
        .select("id, number, client_name, total_value, status, created_at, budget_id, user_id")
        .eq("id", id)
        .maybeSingle();
      if (oErr || !order) throw oErr ?? new Error("Pedido não encontrado");

      const [{ data: profile }, budgetRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, store_name, phone, email, address, document, avatar_url")
          .eq("id", order.user_id)
          .maybeSingle(),
        order.budget_id
          ? supabase
              .from("budgets")
              .select("id, number, client_id, data_vencimento, details, total_value, created_at")
              .eq("id", order.budget_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
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
          items = [{ id: budget.id, position: 1, subtotal: Number(budget.total_value),
            data: (budget.details ?? {}) as ItemData }];
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
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [isLoading, data]);

  if (isLoading) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Carregando pedido…</div>;
  }
  if (!data) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Pedido não encontrado.</div>;
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
    ? fmtDateBR(dStr(general, "dataEntrega")) : "—";
  const observacoes = dStr(general, "observacoes");
  const desconto = dNum(general, "descontoValor");
  const descontoPerc = dNum(general, "descontoPercentual");
  const sinalAtivo = general.sinalAtivo === "sim";
  const valorSinal = dNum(general, "valorSinal");
  const valorAReceber = dNum(general, "valorAReceber");
  const maoObra = dNum(general, "maoDeObraExtra");
  const total = Number(order.total_value);
  const totalItens = items.reduce((s, it) => s + Number(it.subtotal || 0), 0);

  const diversos = extractDiversos(items);
  const frames = items; // every item is a frame block

  const storeName = profile?.store_name || profile?.full_name || "Loja";
  const variantTitle =
    variant === "loja" ? "VIA LOJA"
    : variant === "producao" ? "VIA PRODUÇÃO"
    : "VIA CLIENTE";
  const variantSub =
    variant === "loja" ? "(Completa — Financeiro e Atendimento)"
    : variant === "producao" ? "(Focada na fabricação)"
    : "(Resumo para o cliente)";

  const showFinance = variant !== "producao";
  const showPreview = variant === "producao";

  return (
    <>
      <style>{`
        @page { size: A4; margin: 10mm; }
        html, body { background:#eef0f3; margin:0; padding:0; }
        body { font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
               color:#111; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .sheet {
          width: 210mm; min-height: 297mm; padding: 8mm 8mm 12mm;
          margin: 12px auto; background:#fff; box-shadow:0 2px 10px rgba(0,0,0,.08);
          box-sizing:border-box;
        }
        .via-title { text-align:center; font-size:22px; font-weight:800; color:#7a1f2b;
          letter-spacing:1px; margin:0 0 2px; }
        .via-sub { text-align:center; font-size:11px; color:#555; margin:0 0 8px; }

        .topbar { background:#7a1f2b; color:#fff; padding:10px 14px;
          display:flex; justify-content:space-between; align-items:center; gap:10px;
          border:1px solid #5e1822; }
        .topbar .left { display:flex; align-items:center; gap:10px; min-width:0; }
        .avatar { width:38px; height:38px; border-radius:50%; background:#fff; color:#7a1f2b;
          display:grid; place-items:center; font-weight:800; font-size:14px; overflow:hidden;
          border:1px solid #fff; flex:0 0 38px; }
        .avatar img { width:100%; height:100%; object-fit:cover; }
        .topbar h1 { margin:0; font-size:16px; font-weight:800; letter-spacing:.3px; }
        .topbar .right { text-align:right; font-size:10px; text-transform:uppercase;
          letter-spacing:1px; }
        .topbar .right .num { font-family: ui-monospace, Menlo, Consolas, monospace;
          font-size:14px; font-weight:700; letter-spacing:0; }

        .section-title { font-size:10px; font-weight:800; text-transform:uppercase;
          letter-spacing:1.5px; color:#7a1f2b; margin:14px 0 4px;
          border-bottom:2px solid #7a1f2b; padding-bottom:3px; }

        .grid-2 { display:grid; grid-template-columns: 1fr 1fr; gap:4px 18px;
          font-size:11px; padding:6px 2px; }
        .grid-2 .lbl { color:#444; font-weight:700; display:inline-block; min-width:130px; }

        .item-block { border:1px solid #111; margin-top:8px; page-break-inside:avoid;
          break-inside:avoid; }
        .item-head { background:#7a1f2b; color:#fff; padding:5px 10px;
          display:flex; justify-content:space-between; align-items:center; font-size:12px; }
        .item-head .idx { background:#fff; color:#7a1f2b; width:18px; height:18px;
          border-radius:3px; display:inline-grid; place-items:center; font-weight:800;
          font-size:11px; margin-right:8px; }
        .item-head .title { font-weight:700; }
        .item-head .total { font-weight:700; font-size:11px; }
        .kv-table { width:100%; border-collapse:collapse; font-size:11px; }
        .kv-table td { padding:4px 8px; border-bottom:1px solid #d8d8d8;
          vertical-align:top; }
        .kv-table td.k { width:42%; color:#333; font-weight:600; background:#f6f6f6; }
        .kv-table tr:last-child td { border-bottom:none; }

        .prod-row { display:grid; grid-template-columns: 1fr 1fr; gap:0; }
        @media print { .prod-row { grid-template-columns: 1fr 1fr; } }
        .prod-row .col-preview { padding:8px; border-right:1px solid #d8d8d8;
          display:flex; align-items:center; justify-content:center; min-height:140px; }
        .frame-preview { width:100%; max-width:260px; height:auto; }

        .totals { margin-top:8px; border:1px solid #111; }
        .totals .row { display:flex; justify-content:space-between; padding:5px 10px;
          font-size:11.5px; border-bottom:1px solid #d8d8d8; }
        .totals .row:last-child { border-bottom:none; }
        .totals .row.total { background:#7a1f2b; color:#fff; font-weight:800; font-size:13px; }
        .totals .row.due { background:#eafff1; color:#0c5132; font-weight:800; }
        .totals .row.muted { color:#444; }

        .parc-table { width:100%; border-collapse:collapse; font-size:11px;
          margin-top:8px; border:1px solid #111; }
        .parc-table th, .parc-table td { padding:5px 8px; border-bottom:1px solid #d8d8d8;
          text-align:left; }
        .parc-table th { background:#f0f0f0; font-size:10px; text-transform:uppercase;
          letter-spacing:.5px; }
        .parc-table tr:last-child td { border-bottom:none; }

        .obs-box { margin-top:6px; font-size:11px; padding:6px 8px;
          border:1px dashed #444; background:#fafafa; white-space:pre-wrap; }

        .diverso-block { border:1px solid #111; margin-top:8px;
          page-break-inside:avoid; break-inside:avoid; }
        .diverso-block .item-head { background:#444; }
        .diverso-block .item-head .idx { color:#444; }

        .footer { margin-top:14px; padding-top:6px; border-top:1px solid #444;
          font-size:9.5px; color:#555; text-align:center; }
        .print-actions { position:fixed; top:10px; right:10px; display:flex; gap:8px; z-index:10; }
        .print-actions button { background:#7a1f2b; color:#fff; border:none;
          border-radius:6px; padding:8px 14px; font-size:12px; cursor:pointer;
          box-shadow:0 2px 6px rgba(0,0,0,.15); }
        .print-actions button.secondary { background:#fff; color:#111;
          border:1px solid #ccc; }

        @media print {
          html, body { background:#fff; }
          .sheet { box-shadow:none; margin:0; width:auto; min-height:auto;
            padding:0; }
          .print-actions { display:none; }
          .via-title { color:#000 !important; }
          .section-title { color:#000 !important; border-bottom-color:#000 !important; }
          .topbar { background:#000 !important; border-color:#000 !important; }
          .item-head { background:#000 !important; }
          .item-head .idx { color:#000 !important; }
          .diverso-block .item-head { background:#444 !important; }
          .totals .row.total { background:#000 !important; }
          .totals .row.due { background:#fff !important; color:#000 !important;
            border:1px solid #000; }
        }
      `}</style>

      <div className="print-actions">
        <button type="button" className="secondary" onClick={() => window.close()}>Fechar</button>
        <button type="button" onClick={() => window.print()}>Imprimir</button>
      </div>

      <div className="sheet">
        <div className="via-title">{variantTitle}</div>
        <div className="via-sub">{variantSub}</div>

        <div className="topbar">
          <div className="left">
            <div className="avatar">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" />
                : <span>{getInitials(storeName)}</span>}
            </div>
            <h1>{storeName}</h1>
          </div>
          <div className="right">
            <div>Pedido</div>
            <div className="num">{order.number}</div>
          </div>
        </div>

        {/* Dados (loja + pedido) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
          {variant !== "producao" && (
            <div>
              <div className="section-title">Dados da loja</div>
              <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                <div><b>{storeName}</b></div>
                {profile?.document && <div><b>CNPJ/CPF:</b> {profile.document}</div>}
                {profile?.phone && <div><b>Telefone:</b> {profile.phone}</div>}
                {profile?.email && <div><b>E-mail:</b> {profile.email}</div>}
                {profile?.address && <div><b>Endereço:</b> {profile.address}</div>}
              </div>
            </div>
          )}
          <div style={variant === "producao" ? { gridColumn: "1 / -1" } : undefined}>
            <div className="section-title">Dados do pedido</div>
            <div className="grid-2" style={{ padding: 0 }}>
              {variant === "producao" && (
                <div><span className="lbl">Cliente:</span> {order.client_name || client?.name || "—"}</div>
              )}
              {budget && (
                <div><span className="lbl">Orçamento origem:</span> {budget.number}</div>
              )}
              <div><span className="lbl">Data do pedido:</span> {fmtDate(order.created_at)}</div>
              <div><span className="lbl">Data de entrega:</span> {dataEntrega}</div>
              {variant !== "producao" && (
                <>
                  <div><span className="lbl">Cliente:</span> {order.client_name || client?.name || "—"}</div>
                  {client?.phone && <div><span className="lbl">Telefone:</span> {client.phone}</div>}
                  {client?.email && <div><span className="lbl">E-mail:</span> {client.email}</div>}
                  <div><span className="lbl">Forma de pagamento:</span> {forma}</div>
                  <div><span className="lbl">Condição:</span> {isParcelado ? `Parcelado · ${parcelas.length}x` : condicao}</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Itens */}
        {frames.length > 0 && (
          <>
            <div className="section-title">
              {showPreview ? "Itens para produção" : "Itens do pedido"}
            </div>
            {frames.map((it, idx) => {
              const d = it.data;
              const rows = frameItemRows(d);
              const itemObs = dStr(d, "observacoes");
              const W = fmtM(dNum(d, "larguraFinal"));
              const H = fmtM(dNum(d, "alturaFinal"));
              return (
                <div className="item-block" key={it.id}>
                  <div className="item-head">
                    <div>
                      <span className="idx">{idx + 1}</span>
                      <span className="title">ITEM {idx + 1} — Quadro {W} x {H} cm</span>
                    </div>
                    {showFinance && (
                      <div className="total">Total do item: {fmtMoney(Number(it.subtotal))}</div>
                    )}
                  </div>
                  {showPreview ? (
                    <div className="prod-row">
                      <div className="col-preview">
                        <FramePreview d={d} />
                      </div>
                      <div>
                        <table className="kv-table">
                          <tbody>
                            {rows.map(([k, v], i) => (
                              <tr key={i}><td className="k">{k}</td><td>{v}</td></tr>
                            ))}
                            {itemObs && (
                              <tr><td className="k">Observações</td><td>{itemObs}</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <table className="kv-table">
                      <tbody>
                        {rows.map(([k, v], i) => (
                          <tr key={i}><td className="k">{k}</td><td>{v}</td></tr>
                        ))}
                        {itemObs && (
                          <tr><td className="k">Observações</td><td>{itemObs}</td></tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Produtos diversos */}
        {diversos.length > 0 && (
          <>
            <div className="section-title">Produtos diversos</div>
            {diversos.map((p, i) => {
              const idx = frames.length + i + 1;
              return (
                <div className="item-block diverso-block" key={i}>
                  <div className="item-head">
                    <div>
                      <span className="idx">{idx}</span>
                      <span className="title">ITEM {idx} — {p.nome}</span>
                    </div>
                    {showFinance && (
                      <div className="total">Total do item: {fmtMoney(p.valorTotal)}</div>
                    )}
                  </div>
                  <table className="kv-table">
                    <tbody>
                      <tr><td className="k">Tipo</td><td>Produto diverso</td></tr>
                      {p.code && <tr><td className="k">Código</td><td>{p.code}</td></tr>}
                      <tr><td className="k">Descrição</td><td>{p.descricao || p.nome}</td></tr>
                      {p.fornecedor && <tr><td className="k">Fornecedor</td><td>{p.fornecedor}</td></tr>}
                      <tr><td className="k">Quantidade</td><td>{p.quantidade}</td></tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </>
        )}

        {/* Financeiro */}
        {showFinance && (
          <div style={{ display: "grid",
            gridTemplateColumns: variant === "loja" && isParcelado ? "1fr 1fr" : "1fr",
            gap: 12, marginTop: 6, alignItems: "start" }}>
            <div>
              <div className="section-title">Resumo financeiro</div>
              <div className="totals">
                {variant === "loja" && maoObra > 0 && (
                  <div className="row muted"><span>Mão de obra extra</span><span>{fmtMoney(maoObra)}</span></div>
                )}
                {variant === "loja" && dNum(general, "valorInstalacao") > 0 && (
                  <div className="row muted"><span>Instalação</span><span>{fmtMoney(dNum(general,"valorInstalacao"))}</span></div>
                )}
                {variant === "loja" && dNum(general, "valorEntrega") > 0 && (
                  <div className="row muted"><span>Entrega / Frete</span><span>{fmtMoney(dNum(general,"valorEntrega"))}</span></div>
                )}
                <div className="row muted">
                  <span>Desconto{descontoPerc > 0 ? ` (${descontoPerc}%)` : ""}</span>
                  <span>{desconto > 0 ? `- ${fmtMoney(desconto)}` : fmtMoney(0)}</span>
                </div>
                {variant === "loja" && (
                  <div className="row muted"><span>Total dos itens</span><span>{fmtMoney(totalItens)}</span></div>
                )}
                <div className="row total"><span>TOTAL GERAL</span><span>{fmtMoney(total)}</span></div>
                {sinalAtivo && valorSinal > 0 && (
                  <>
                    <div className="row"><span>Sinal pago</span><span>{fmtMoney(valorSinal)}</span></div>
                    <div className="row due">
                      <span>{variant === "cliente" ? "Valor a pagar" : "Valor a receber"}</span>
                      <span>{fmtMoney(valorAReceber || (total - valorSinal))}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {isParcelado && (
              <div>
                <div className="section-title">Parcelas ({parcelas.length}x)</div>
                <table className="parc-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>Vencimento</th>
                      <th style={{ width: 90, textAlign: "right" }}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcelas.map((p) => (
                      <tr key={p.numero}>
                        <td>{p.numero}/{parcelas.length}</td>
                        <td>{p.vencimento ? fmtDateBR(p.vencimento) : "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>{fmtMoney(p.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {observacoes && (
          <>
            <div className="section-title">Observações</div>
            <div className="obs-box">{observacoes}</div>
          </>
        )}

        <div className="footer">
          {storeName} · Pedido {order.number} · {variantTitle.replace("VIA ", "Via ")} ·
          {" "}Emitido em {fmtDate(new Date().toISOString())}
        </div>
      </div>
    </>
  );
}
