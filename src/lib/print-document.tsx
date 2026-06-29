// Print document renderer — opened in a new tab. Does not auto-call window.print().
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Variant = "loja" | "producao" | "cliente";
export type DocKind = "pedido" | "orcamento";
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
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "·"
  );
}

/** Compact SVG preview: only outer rect, art rect, optional internal paspatur; outer dims + central "ARTE WxH". */
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

  // Use a fixed viewBox to ensure ARTE label is visually same size regardless of frame dimensions.
  const VB = 200;
  const pad = 22;
  const inner = VB - pad * 2;
  const scale = Math.min(inner / W, inner / H);
  const dw = W * scale;
  const dh = H * scale;
  const x0 = (VB - dw) / 2;
  const y0 = (VB - dh) / 2;

  const extX = x0 + mE * scale;
  const extY = y0 + mS * scale;
  const extW = dw - (mE + mD) * scale;
  const extH = dh - (mS + mI) * scale;

  const intX = extX + aE * scale;
  const intY = extY + aS * scale;
  const intW = extW - (aE + aD) * scale;
  const intH = extH - (aS + aI) * scale;

  // The "art" inner rectangle to label (innermost present)
  const artX = hasInt && intW > 0 && intH > 0 ? intX : hasExt ? extX : x0;
  const artY = hasInt && intW > 0 && intH > 0 ? intY : hasExt ? extY : y0;
  const artW = hasInt && intW > 0 && intH > 0 ? intW : hasExt ? extW : dw;
  const artH = hasInt && intW > 0 && intH > 0 ? intH : hasExt ? extH : dh;

  // Art dimensions in cm to display in label
  const artCmW = dNum(d, "larguraOriginal") || (W - mE - mD - aE - aD);
  const artCmH = dNum(d, "alturaOriginal") || (H - mS - mI - aS - aI);

  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      className="frame-preview"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* medida superior */}
      <text x={VB / 2} y={y0 - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill="#000">{fmtM(W)} cm</text>
      {/* medida lateral esquerda */}
      <text
        x={x0 - 7}
        y={y0 + dh / 2}
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="#000"
        transform={`rotate(-90 ${x0 - 7} ${y0 + dh / 2})`}
      >
        {fmtM(H)} cm
      </text>

      {/* contornos do quadro e paspatur */}
      <rect x={x0} y={y0} width={dw} height={dh} fill="#fff" stroke="#000" strokeWidth="1.2" />
      {hasExt && (
        <rect x={extX} y={extY} width={extW} height={extH} fill="none" stroke="#000" strokeWidth="0.8" />
      )}
      {hasInt && intW > 0 && intH > 0 && (
        <rect x={intX} y={intY} width={intW} height={intH} fill="none" stroke="#000" strokeWidth="0.8" />
      )}

      {/* texto central ARTE LxA */}
      <text
        x={artX + artW / 2}
        y={artY + artH / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="12"
        fontWeight="700"
        fill="#000"
      >
        ARTE {fmtM(artCmW)}×{fmtM(artCmH)}
      </text>
    </svg>
  );
}

type DiversoEx = Diverso & { valorUnitario: number; itemPos: number };

function extractDiversos(items: Array<{ position: number; data: ItemData }>): DiversoEx[] {
  const out: DiversoEx[] = [];
  for (const it of items) {
    const raw = it.data.produtosDiversos;
    if (!Array.isArray(raw)) continue;
    for (const p of raw as Array<Record<string, unknown>>) {
      const qtd = Number(p.quantidade) || 1;
      const valorUnit =
        Number(p.valorUnitario) || Number(p.valor) || Number(p.preco) || 0;
      const valorTotal =
        Number(p.total) || Number(p.valorTotal) || valorUnit * qtd;
      out.push({
        code: typeof p.code === "string" ? p.code : undefined,
        nome:
          typeof p.nome === "string"
            ? p.nome
            : typeof p.descricao === "string"
              ? p.descricao
              : "Produto",
        descricao: typeof p.descricao === "string" ? p.descricao : undefined,
        fornecedor: typeof p.fornecedor === "string" ? p.fornecedor : undefined,
        quantidade: qtd,
        valorUnitario: valorUnit,
        valorTotal,
        itemPos: it.position,
      });
    }
  }
  return out;
}

function diversosTotalForItem(d: ItemData): number {
  const raw = d.produtosDiversos;
  if (!Array.isArray(raw)) return 0;
  let s = 0;
  for (const p of raw as Array<Record<string, unknown>>) {
    const qtd = Number(p.quantidade) || 1;
    const unit =
      Number(p.valorUnitario) || Number(p.valor) || Number(p.preco) || 0;
    s += Number(p.total) || Number(p.valorTotal) || unit * qtd;
  }
  return s;
}

type CompRow = { categoria: string; qtd: number; produto: string; valor: number };

function componentRows(d: ItemData): CompRow[] {
  const rows: CompRow[] = [];

  if (dStr(d, "paspaturAtivo") === "sim") {
    const lblExt = productLabel(d, "paspaturCode", "paspaturDescription");
    if (lblExt !== "—") {
      rows.push({
        categoria: "Paspatur externo",
        qtd: 1,
        produto: lblExt,
        valor: dNum(d, "valorPaspaturPrincipal"),
      });
    }
    if (dStr(d, "paspaturAdicionalAtivo") === "sim") {
      const lblInt = productLabel(d, "paspaturAdicionalCode", "paspaturAdicionalDescription");
      if (lblInt !== "—") {
        rows.push({
          categoria: "Paspatur interno",
          qtd: 1,
          produto: lblInt,
          valor: dNum(d, "valorPaspaturAdicional"),
        });
      }
    }
  }

  // Ordem: Perfil interno primeiro, depois Perfil externo.
  const temPerfilExterno = dStr(d, "perfilAdicionalAtivo") === "sim";
  const perfilPrincipalLabel = productLabel(d, "perfilCode", "perfilDescription");
  if (temPerfilExterno) {
    if (perfilPrincipalLabel !== "—") {
      rows.push({
        categoria: "Perfil interno",
        qtd: 1,
        produto: perfilPrincipalLabel,
        valor: dNum(d, "valorPerfilPrincipal"),
      });
    }
    const perfilExtLabel = productLabel(d, "perfilAdicionalCode", "perfilAdicionalDescription");
    if (perfilExtLabel !== "—") {
      rows.push({
        categoria: "Perfil externo",
        qtd: 1,
        produto: perfilExtLabel,
        valor: dNum(d, "valorPerfilAdicional"),
      });
    }
  } else if (perfilPrincipalLabel !== "—") {
    rows.push({
      categoria: "Perfil",
      qtd: 1,
      produto: perfilPrincipalLabel,
      valor: dNum(d, "valorPerfilPrincipal"),
    });
  }

  if (dStr(d, "vidroTipo") === "sim") {
    const base = productLabel(d, "vidroCode", "vidroDescription");
    if (base !== "—") {
      const qtd = Number(dNum(d, "vidroQuantidade")) || 1;
      rows.push({ categoria: "Vidro / Espelho", qtd, produto: base, valor: dNum(d, "valorVidro") });
    }
  }

  const foamLabel = productLabel(d, "foamCode", "foamDescription");
  if (foamLabel !== "—") {
    rows.push({ categoria: "Foam / MDF", qtd: 1, produto: foamLabel, valor: dNum(d, "valorFoam") });
  }

  if (dStr(d, "colagemAtivo") === "sim") {
    const colLabel = productLabel(d, "colagemCode", "colagemDescription");
    if (colLabel !== "—") {
      rows.push({ categoria: "Colagem", qtd: 1, produto: colLabel, valor: dNum(d, "valorColagem") });
    }
  }

  if (dStr(d, "impressaoAtivo") === "sim") {
    const impLabel = productLabel(d, "impressaoCode", "impressaoDescription");
    if (impLabel !== "—") {
      rows.push({ categoria: "Impressão", qtd: 1, produto: impLabel, valor: dNum(d, "valorImpressao") });
    }
  }
  return rows;
}

function infoRows(d: ItemData): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const aoX = fmtM(dNum(d, "larguraOriginal"));
  const aoY = fmtM(dNum(d, "alturaOriginal"));
  const fX = fmtM(dNum(d, "larguraFinal"));
  const fY = fmtM(dNum(d, "alturaFinal"));
  rows.push(["Medida final", `${fX} x ${fY} cm`]);
  rows.push(["Arte (sem paspatur)", `${aoX} x ${aoY} cm`]);

  if (
    dStr(d, "paspaturAtivo") === "sim" &&
    (dNum(d, "margemSup") || dNum(d, "margemInf") || dNum(d, "margemEsq") || dNum(d, "margemDir"))
  ) {
    rows.push([
      "Margens (Externo)",
      `Sup ${fmtM(dNum(d, "margemSup"))} | Inf ${fmtM(dNum(d, "margemInf"))} | Esq ${fmtM(dNum(d, "margemEsq"))} | Dir ${fmtM(dNum(d, "margemDir"))} cm`,
    ]);
  }
  if (
    dStr(d, "paspaturAdicionalAtivo") === "sim" &&
    (dNum(d, "paspaturAdicionalSup") ||
      dNum(d, "paspaturAdicionalInf") ||
      dNum(d, "paspaturAdicionalEsq") ||
      dNum(d, "paspaturAdicionalDir"))
  ) {
    rows.push([
      "Margens (Interno)",
      `Sup ${fmtM(dNum(d, "paspaturAdicionalSup"))} | Inf ${fmtM(dNum(d, "paspaturAdicionalInf"))} | Esq ${fmtM(dNum(d, "paspaturAdicionalEsq"))} | Dir ${fmtM(dNum(d, "paspaturAdicionalDir"))} cm`,
    ]);
  }
  return rows;
}

function ComponentsTable({ rows, showPrices, priceMultiplier = 1 }: { rows: CompRow[]; showPrices: boolean; priceMultiplier?: number }) {
  if (rows.length === 0) return null;
  const showQty = rows.some((r) => r.qtd > 1);
  return (
    <table className="comp-table">
      <thead>
        <tr>
          <th className="cat">Categoria</th>
          {showQty && <th className="qty">Qtd</th>}
          <th className="prod">Produto / Descrição</th>
          {showPrices && <th className="val">Valor</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="cat">{r.categoria}</td>
            {showQty && <td className="qty">{r.qtd > 1 ? `${r.qtd}x` : ""}</td>}
            <td className="prod">{r.produto}</td>
            {showPrices && <td className="val">{fmtMoney(r.valor * priceMultiplier)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PrintDocument({
  kind,
  id,
  via,
}: {
  kind: DocKind;
  id: string;
  via: string;
}) {
  const variant: Variant = via === "producao" || via === "cliente" ? via : "loja";

  const { data, isLoading } = useQuery({
    queryKey: ["print", kind, id],
    queryFn: async () => {
      let order: {
        id: string;
        number: string;
        client_name: string;
        total_value: number;
        created_at: string;
        budget_id: string | null;
        user_id: string;
      } | null = null;
      let budget: {
        id: string;
        number: string;
        client_id: string | null;
        data_vencimento: string | null;
        details: ItemData | null;
        total_value: number;
        created_at: string;
        user_id?: string;
      } | null = null;

      if (kind === "pedido") {
        const { data: o, error } = await supabase
          .from("orders")
          .select("id, number, client_name, total_value, created_at, budget_id, user_id")
          .eq("id", id)
          .maybeSingle();
        if (error || !o) throw error ?? new Error("Pedido não encontrado");
        order = o as any;
        if (o.budget_id) {
          const { data: b } = await supabase
            .from("budgets")
            .select("id, number, client_id, data_vencimento, details, total_value, created_at")
            .eq("id", o.budget_id)
            .maybeSingle();
          budget = b as any;
        }
      } else {
        const { data: b, error } = await supabase
          .from("budgets")
          .select("id, number, client_id, client_name, data_vencimento, details, total_value, created_at, user_id")
          .eq("id", id)
          .maybeSingle();
        if (error || !b) throw error ?? new Error("Orçamento não encontrado");
        budget = b as any;
        order = {
          id: b.id,
          number: b.number,
          client_name: (b as any).client_name ?? "",
          total_value: Number(b.total_value),
          created_at: b.created_at,
          budget_id: b.id,
          user_id: (b as any).user_id,
        };
      }

      const ownerId = order!.user_id;
      const [{ data: profile }, itemsRes, clientRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, store_name, phone, email, address, document, avatar_url")
          .eq("id", ownerId)
          .maybeSingle(),
        budget?.id
          ? supabase
              .from("budget_items")
              .select("id, position, subtotal, data")
              .eq("budget_id", budget.id)
              .order("position", { ascending: true })
          : Promise.resolve({ data: [] as any }),
        budget?.client_id
          ? supabase
              .from("clients")
              .select("name, phone, email, document, address")
              .eq("id", budget.client_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      let items: Array<{ id: string; position: number; subtotal: number; data: ItemData }> =
        ((itemsRes as any).data ?? []) as any;
      if (items.length === 0 && budget) {
        items = [
          {
            id: budget.id,
            position: 1,
            subtotal: Number(budget.total_value),
            data: (budget.details ?? {}) as ItemData,
          },
        ];
      }

      return { order: order!, profile, budget, items, client: (clientRes as any).data ?? null };
    },
  });

  // Não dispara impressão automaticamente: a tela abre em nova aba e o
  // usuário decide quando clicar em "Imprimir", para não travar o sistema.

  if (isLoading) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Carregando…</div>;
  }
  if (!data) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Documento não encontrado.</div>;
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
  const dataEntrega = dStr(general, "dataEntrega") ? fmtDateBR(dStr(general, "dataEntrega")) : "—";
  const observacoes = dStr(general, "observacoes");
  const desconto = dNum(general, "descontoValor");
  const descontoPerc = dNum(general, "descontoPercentual");
  const sinalAtivo = general.sinalAtivo === "sim";
  const valorSinal = dNum(general, "valorSinal");
  const valorAReceber = dNum(general, "valorAReceber");
  const maoObra = dNum(general, "maoDeObraExtra");
  const rtPerc = dNum(general, "rtPercentual");
  const rtValor = dNum(general, "rtValor");
  const rtMult = 1 + (rtPerc || 0) / 100;
  const total = Number(order.total_value);
  const totalItens = items.reduce((s, it) => s + Number(it.subtotal || 0), 0);

  const diversos = extractDiversos(items);
  const frames = items;

  const storeName = profile?.store_name || profile?.full_name || "Loja";
  const docLabel = kind === "pedido" ? "Pedido" : "Orçamento";
  const variantTitle =
    variant === "loja" ? "VIA LOJA" : variant === "producao" ? "VIA PRODUÇÃO" : "VIA CLIENTE";

  const showFinance = variant !== "producao";
  const showPreview = variant === "producao";

  return (
    <>
      <style>{`
        @page { size: A4; margin: 8mm; }
        html, body { background:#eef0f3; margin:0; padding:0; }
        body { font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
               color:#000; -webkit-print-color-adjust:exact; print-color-adjust:exact; font-size: 10.5px; }
        .sheet {
          width: 210mm; min-height: 297mm; padding: 6mm 7mm 8mm;
          margin: 10px auto; background:#fff; box-shadow:0 2px 10px rgba(0,0,0,.08);
          box-sizing:border-box;
        }
        .via-title { text-align:center; font-size:12px; font-weight:800; color:#000;
          letter-spacing:1.4px; margin:0 0 4px; }

        /* Lightweight topbar: no filled bar, only thin underline */
        .topbar { display:flex; justify-content:space-between; align-items:center; gap:8px;
          padding:2px 2px 5px; border-bottom:1.2px solid #000; }
        .topbar .left { display:flex; align-items:center; gap:8px; min-width:0; }
        .avatar { height:34px; max-width:140px; color:#000;
          display:inline-flex; align-items:center; font-weight:800; font-size:11px;
          flex:0 0 auto; }
        .avatar img { height:34px; max-width:140px; width:auto; object-fit:contain; display:block; }
        .topbar h1 { margin:0; font-size:14px; font-weight:800; letter-spacing:.2px; color:#000; }
        .topbar .right { text-align:right; font-size:9px; text-transform:uppercase;
          letter-spacing:.6px; line-height:1.15; color:#000; }
        .topbar .right .num { font-family: ui-monospace, Menlo, Consolas, monospace;
          font-size:13px; font-weight:700; letter-spacing:0; color:#000; }

        .section-title { font-size:9.5px; font-weight:800; text-transform:uppercase;
          letter-spacing:1px; color:#000; margin:8px 0 3px;
          border-bottom:1px solid #000; padding-bottom:2px; }

        .grid-2 { display:grid; grid-template-columns: 1fr 1fr; gap:2px 14px;
          font-size:10.5px; padding:2px 0; }
        .grid-2 .lbl { color:#000; font-weight:700; display:inline-block; min-width:105px; }

        /* Item block: no filled header bar, just bold title + thin underline + numbered square */
        .item-block { margin-top:6px; page-break-inside:avoid; break-inside:avoid; }
        .item-head { padding:2px 0 3px; display:flex; justify-content:space-between;
          align-items:center; font-size:11.5px; border-bottom:1px solid #000; margin-bottom:0; }
        .item-head .left { display:flex; align-items:center; gap:6px; min-width:0; }
        .item-head .idx { background:#fff; color:#000; width:16px; height:16px;
          border:1.2px solid #000; border-radius:2px; display:inline-grid; place-items:center;
          font-weight:800; font-size:10px; }
        .item-head .title { font-weight:800; color:#000; }
        .item-head .total { font-weight:700; font-size:11px; color:#000; }

        .kv-table { width:100%; border-collapse:collapse; font-size:10.5px; }
        .kv-table td { padding:2.5px 7px; border-bottom:1px solid #ddd; vertical-align:top; }
        .kv-table td.k { width:38%; color:#000; font-weight:600; background:#fff; }
        .kv-table tr:last-child td { border-bottom:none; }

        /* Components table: Categoria | Qtd | Produto/Descrição | Valor */
        .comp-table { width:100%; border-collapse:collapse; font-size:10.5px; margin-top:2px; }
        .comp-table th, .comp-table td { padding:4px 10px; border-bottom:1px solid #ddd;
          vertical-align:top; color:#000; }
        .comp-table th { font-size:9px; text-transform:uppercase; letter-spacing:.5px;
          font-weight:800; border-bottom:1px solid #000; text-align:left; background:#fff; }
        .comp-table th.qty, .comp-table td.qty { width:46px; text-align:center;
          font-variant-numeric: tabular-nums; white-space:nowrap; }
        .comp-table th.val, .comp-table td.val { width:90px; text-align:right;
          font-variant-numeric: tabular-nums; white-space:nowrap; font-weight:700; }
        .comp-table th.cat, .comp-table td.cat { width:130px; font-weight:700; }
        .comp-table tr:last-child td { border-bottom:none; }

        .item-obs { margin-top:4px; font-size:10px; padding:4px 8px;
          border:1px dashed #999; background:#fff; white-space:pre-wrap; color:#000; border-radius:2px; }

        /* Production row: preview ~40% width, larger */
        .prod-row { display:grid; grid-template-columns: 40% 60%; gap:0; align-items:stretch; }
        .prod-row .col-preview { padding:4px 8px 4px 2px; border-right:1px solid #ccc;
          display:flex; align-items:center; justify-content:center; }
        .frame-preview { width:100%; height:auto; max-height:78mm; aspect-ratio:1/1; }
        .prod-row .kv-table { font-size:11px; }
        .prod-row .kv-table td { padding:3px 7px; }

        .totals { margin-top:4px; border:1px solid #000; border-radius:2px; overflow:hidden; }
        .totals .row { display:flex; justify-content:space-between; padding:3px 8px;
          font-size:10.5px; border-bottom:1px solid #ddd; color:#000; }
        .totals .row:last-child { border-bottom:none; }
        .totals .row.total { background:#fff; color:#000; font-weight:800; font-size:12px;
          border-top:1.5px solid #000; }
        .totals .row.due { background:#fff; color:#000; font-weight:800;
          border-top:1px solid #000; }
        .totals .row.muted { color:#000; }

        .parc-table { width:100%; border-collapse:collapse; font-size:10px;
          margin-top:4px; border:1px solid #000; border-radius:2px; overflow:hidden; }
        .parc-table th, .parc-table td { padding:3px 7px; border-bottom:1px solid #ddd;
          text-align:left; color:#000; }
        .parc-table th { background:#fff; font-size:9px; text-transform:uppercase;
          letter-spacing:.4px; border-bottom:1px solid #000; }
        .parc-table tr:last-child td { border-bottom:none; }

        .obs-box { margin-top:4px; font-size:10px; padding:5px 7px;
          border:1px dashed #555; background:#fff; white-space:pre-wrap; border-radius:2px;
          color:#000; }

        .footer { margin-top:10px; padding-top:4px; border-top:1px solid #000;
          font-size:9px; color:#000; text-align:center; }
        .print-actions { position:fixed; top:10px; right:10px; display:flex; gap:8px; z-index:10; }
        .print-actions button { background:#000; color:#fff; border:none;
          border-radius:6px; padding:8px 14px; font-size:12px; cursor:pointer;
          box-shadow:0 2px 6px rgba(0,0,0,.15); }
        .print-actions button.secondary { background:#fff; color:#000;
          border:1px solid #000; }

        /* Guia fixo de impressão à esquerda (não imprime) */
        .print-guide { position:fixed; top:12px; left:12px; width:240px;
          background:#fff; border:1px solid #e4e4e7; border-radius:10px;
          padding:14px 16px; box-shadow:0 4px 12px rgba(0,0,0,.06); z-index:5;
          color:#000; font-size:12px; line-height:1.5; text-align:left; }
        .print-guide h3 { margin:0 0 8px; font-size:14px; font-weight:800;
          display:flex; align-items:center; gap:6px; }
        .print-guide ol { margin:0; padding-left:18px; }
        .print-guide li { margin-bottom:6px; }
        .print-guide strong { font-weight:700; }
        @media (max-width: 1100px) { .print-guide { display:none; } }

        @media print {
          html, body { background:#fff; }
          .sheet { box-shadow:none; margin:0; width:auto; min-height:auto; padding:0; }
          .print-actions, .print-guide { display:none; }
        }
      `}</style>

      <aside className="print-guide" aria-label="Como imprimir">
        <h3>🖨️ Como imprimir</h3>
        <ol>
          <li>Na primeira etapa, clique em <strong>Imprimir</strong>.</li>
          <li>O navegador abrirá a janela de impressão.</li>
          <li>Enquanto essa janela estiver aberta, a aba do sistema ficará temporariamente bloqueada pelo navegador.</li>
          <li>Após imprimir ou cancelar, basta fechar a janela de impressão para continuar utilizando o sistema normalmente.</li>
        </ol>
      </aside>

      <div className="print-actions">
        <button type="button" className="secondary" onClick={() => window.close()}>Fechar</button>
        <button type="button" onClick={() => window.print()}>Imprimir</button>
      </div>

      <div className="sheet">
        <div className="via-title">{variantTitle}</div>

        <div className="topbar">
          <div className="left">
            <div className="avatar">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{getInitials(storeName)}</span>}
            </div>
            <h1>{storeName}</h1>
          </div>
          <div className="right">
            <div>{docLabel}</div>
            <div className="num">{order.number || "—"}</div>
          </div>
        </div>

        <div className="section-title">Dados do {docLabel.toLowerCase()}</div>
        <div className="grid-2">
          <div>
            <span className="lbl">Cliente:</span>{" "}
            {order.client_name || client?.name || "—"}
          </div>
          {kind === "pedido" && budget && (
            <div><span className="lbl">Orçamento origem:</span> {budget.number || "—"}</div>
          )}
          <div>
            <span className="lbl">Data {kind === "pedido" ? "do pedido" : "do orçamento"}:</span>{" "}
            {fmtDate(order.created_at)}
          </div>
          <div><span className="lbl">Data de entrega:</span> {dataEntrega}</div>
          {variant !== "producao" && (
            <>
              {client?.phone && <div><span className="lbl">Telefone:</span> {client.phone}</div>}
              {client?.email && <div><span className="lbl">E-mail:</span> {client.email}</div>}
              <div><span className="lbl">Forma de pagamento:</span> {forma}</div>
              <div>
                <span className="lbl">Condição:</span>{" "}
                {isParcelado ? `Parcelado · ${parcelas.length}x` : condicao}
              </div>
            </>
          )}
        </div>

        {/* Itens */}
        {frames.length > 0 && (
          <>
            <div className="section-title">{showPreview ? "Itens para produção" : "Itens"}</div>
            {frames.map((it, idx) => {
              const d = it.data;
              const comps = componentRows(d);
              const info = infoRows(d);
              const itemObs = dStr(d, "observacoes");
              const W = fmtM(dNum(d, "larguraFinal"));
              const H = fmtM(dNum(d, "alturaFinal"));
              return (
                <div className="item-block" key={it.id}>
                  <div className="item-head">
                    <div className="left">
                      <span className="idx">{idx + 1}</span>
                      <span className="title">ITEM {idx + 1} — Quadro {W} x {H} cm</span>
                    </div>
                    {showFinance && (
                      <div className="total">
                        Total: {fmtMoney((Number(it.subtotal) - diversosTotalForItem(d)) * rtMult)}
                      </div>
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
                            {info.map(([k, v], i) => (
                              <tr key={i}><td className="k">{k}</td><td>{v}</td></tr>
                            ))}
                            {itemObs && (
                              <tr><td className="k">Observações</td><td>{itemObs}</td></tr>
                            )}
                          </tbody>
                        </table>
                        <ComponentsTable rows={comps} showPrices={false} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <ComponentsTable rows={comps} showPrices={variant === "loja"} priceMultiplier={rtMult} />
                      {itemObs && (
                        <div className="item-obs"><strong>Observações:</strong> {itemObs}</div>
                      )}
                    </>
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
              const unit = (p.valorUnitario || (p.quantidade ? p.valorTotal / p.quantidade : 0)) * rtMult;
              const totalDiv = p.valorTotal * rtMult;
              return (
                <div className="item-block diverso-block" key={i}>
                  <div className="item-head">
                    <div className="left">
                      <span className="idx">{idx}</span>
                      <span className="title">
                        ITEM {idx} — {p.nome}
                        {frames.length > 0 ? ` (ref. Item ${p.itemPos})` : ""}
                      </span>
                    </div>
                    {showFinance && (
                      <div className="total">Total: {fmtMoney(totalDiv)}</div>
                    )}
                  </div>
                  <table className="kv-table">
                    <tbody>
                      <tr><td className="k">Tipo</td><td>Produto diverso</td></tr>
                      {p.code ? <tr><td className="k">Código</td><td>{p.code}</td></tr> : null}
                      <tr><td className="k">Descrição</td><td>{p.descricao || p.nome}</td></tr>
                      {p.fornecedor ? <tr><td className="k">Fornecedor</td><td>{p.fornecedor}</td></tr> : null}
                      <tr><td className="k">Quantidade</td><td>{p.quantidade}</td></tr>
                      {showFinance && (
                        <>
                          <tr><td className="k">Valor unitário</td><td>{fmtMoney(unit)}</td></tr>
                          <tr><td className="k">Total do item</td><td>{fmtMoney(totalDiv)}</td></tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </>
        )}

        {/* Financeiro */}
        {showFinance && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: variant === "loja" && isParcelado ? "1fr 1fr" : "1fr",
              gap: 10,
              marginTop: 4,
              alignItems: "start",
            }}
          >
            <div>
              <div className="section-title">Resumo financeiro</div>
              <div className="totals">
                {variant === "loja" && maoObra > 0 && (
                  <div className="row muted"><span>Mão de obra extra</span><span>{fmtMoney(maoObra)}</span></div>
                )}
                {variant === "loja" && dNum(general, "valorInstalacao") > 0 && (
                  <div className="row muted"><span>Instalação</span><span>{fmtMoney(dNum(general, "valorInstalacao"))}</span></div>
                )}
                {variant === "loja" && dNum(general, "valorEntrega") > 0 && (
                  <div className="row muted"><span>Entrega / Frete</span><span>{fmtMoney(dNum(general, "valorEntrega"))}</span></div>
                )}
                {variant === "loja" && rtValor > 0 && (
                  <div className="row muted">
                    <span>RT / Comissão Técnica{rtPerc > 0 ? ` (${rtPerc}%)` : ""}</span>
                    <span>{fmtMoney(rtValor)}</span>
                  </div>
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
                      <th style={{ width: 36 }}>#</th>
                      <th>Vencimento</th>
                      <th style={{ width: 80, textAlign: "right" }}>Valor</th>
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
          {storeName} · {docLabel} {order.number || "—"} · {variantTitle.replace("VIA ", "Via ")} ·{" "}
          Emitido em {fmtDate(new Date().toISOString())} às{" "}
          {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </>
  );
}
