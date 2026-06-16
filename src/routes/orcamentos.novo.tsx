import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Ruler,
  Frame,
  Square,
  Layers,
  Image as ImageIcon,
  Scissors,
  Printer,
  Truck,
  CheckCircle2,
  Check,
  X,
  Upload,
  ChevronsUpDown,
  Plus,
  MoreVertical,
  Trash2,
  Copy,
  Package,
} from "lucide-react";


import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/orcamentos/novo")({
  head: () => ({ meta: [{ title: "Novo Orçamento — Total Maxx ERP" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: NovoOrcamento,
});

type StepKey =
  | "tamanho"
  | "paspatur"
  | "perfil"
  | "vidro"
  | "foam"
  | "colagem"
  | "impressao"
  | "diversos"
  | "instalacao"
  | "finalizacao";

const steps: { key: StepKey; label: string; icon: typeof Ruler }[] = [
  { key: "tamanho", label: "Tamanho", icon: Ruler },
  { key: "paspatur", label: "Paspatur", icon: ImageIcon },
  { key: "perfil", label: "Perfil", icon: Frame },
  { key: "vidro", label: "Vidro / Espelho", icon: Square },
  { key: "foam", label: "Foam / MDF", icon: Layers },
  { key: "colagem", label: "Colagem", icon: Scissors },
  { key: "impressao", label: "Impressão", icon: Printer },
  { key: "diversos", label: "Produtos Diversos", icon: Package },
  { key: "instalacao", label: "Instalação / Frete", icon: Truck },
  { key: "finalizacao", label: "Finalização", icon: CheckCircle2 },
];

type Produto = {
  id: string;
  code: string;
  description: string;
  value_per_meter: number;
  profit_margin: number;
  waste_percentage: number;
  category: string | null;
  frame_width_cm: number | null;
};

const fmtMoney = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function parseNum(v: string): number {
  if (!v) return 0;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function calcAreaValue(prod: Produto | null, altura: number, largura: number) {
  if (!prod || altura <= 0 || largura <= 0) return 0;
  const area = (altura * largura) / 10000;
  const base = area * Number(prod.value_per_meter);
  const comPerda = base * (1 + Number(prod.waste_percentage) / 100);
  const final = comPerda * (1 + Number(prod.profit_margin) / 100);
  return final;
}

function useCategoryProducts(categories: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["products", ...categories],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, code, description, value_per_meter, profit_margin, waste_percentage, category, frame_width_cm",
        )
        .in("category", categories)
        .order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Produto[];
    },
  });
}

type TipoEntrega = "Retirada" | "Motoboy" | "Sedex" | "Transportadora" | "Outro";
type FormaPagto =
  | "Dinheiro"
  | "Pix"
  | "Cartão de crédito"
  | "Cartão de débito"
  | "Boleto"
  | "A combinar";

// Per-item state shape
type DiversoItem = {
  uid: string;
  productId: string;
  code: string;
  nome: string;
  valorUnitario: number;
  quantidade: number;
};

type ItemSnapshot = {
  altura: string;
  largura: string;
  paspaturAtivo: "sim" | "nao";
  margemEsq: string;
  margemDir: string;
  margemSup: string;
  margemInf: string;
  paspaturId: string;
  paspaturAdicionalAtivo: "sim" | "nao";
  paspaturAdicionalObs: string;
  paspaturAdicionalEsq: string;
  paspaturAdicionalDir: string;
  paspaturAdicionalSup: string;
  paspaturAdicionalInf: string;
  paspaturAdicionalId: string;
  perfilId: string;
  perfilAdicionalAtivo: "sim" | "nao";
  perfilAdicionalId: string;
  vidroTipo: "sim" | "nao";
  vidroId: string;
  vidroQuantidade: string;
  foamId: string;
  colagemAtivo: "sim" | "nao";
  colagemId: string;
  impressaoAtivo: "sim" | "nao";
  impressaoId: string;
  produtosDiversos: DiversoItem[];
};

const emptyItem: ItemSnapshot = {
  altura: "",
  largura: "",
  paspaturAtivo: "nao",
  margemEsq: "",
  margemDir: "",
  margemSup: "",
  margemInf: "",
  paspaturId: "",
  paspaturAdicionalAtivo: "nao",
  paspaturAdicionalObs: "",
  paspaturAdicionalEsq: "",
  paspaturAdicionalDir: "",
  paspaturAdicionalSup: "",
  paspaturAdicionalInf: "",
  paspaturAdicionalId: "",
  perfilId: "",
  perfilAdicionalAtivo: "nao",
  perfilAdicionalId: "",
  vidroTipo: "nao",
  vidroId: "",
  vidroQuantidade: "1",
  foamId: "",
  colagemAtivo: "nao",
  colagemId: "",
  impressaoAtivo: "nao",
  impressaoId: "",
  produtosDiversos: [],
};

type ItemValues = ReturnType<typeof computeItemValues>;

function computeItemValues(
  snap: ItemSnapshot,
  P: {
    paspatur: Produto | null;
    paspaturAdicional: Produto | null;
    perfil: Produto | null;
    perfilAdicional: Produto | null;
    vidro: Produto | null;
    foam: Produto | null;
    colagem: Produto | null;
    impressao: Produto | null;
  },
) {
  const alturaNum = parseNum(snap.altura);
  const larguraNum = parseNum(snap.largura);
  const mEsq = parseNum(snap.margemEsq);
  const mDir = parseNum(snap.margemDir);
  const mSup = parseNum(snap.margemSup);
  const mInf = parseNum(snap.margemInf);
  const larguraFinal = larguraNum + mEsq + mDir;
  const alturaFinal = alturaNum + mSup + mInf;

  // Additional paspatur margins (do NOT affect frame final size)
  const mEsqA = parseNum(snap.paspaturAdicionalEsq);
  const mDirA = parseNum(snap.paspaturAdicionalDir);
  const mSupA = parseNum(snap.paspaturAdicionalSup);
  const mInfA = parseNum(snap.paspaturAdicionalInf);
  const larguraAdicional = larguraNum + mEsqA + mDirA;
  const alturaAdicional = alturaNum + mSupA + mInfA;

  let valorPaspaturPrincipal = 0;
  if (snap.paspaturAtivo === "sim" && P.paspatur && larguraFinal > 0 && alturaFinal > 0) {
    const area = (larguraFinal * alturaFinal) / 10000;
    const base = area * Number(P.paspatur.value_per_meter);
    const cp = base * (1 + Number(P.paspatur.waste_percentage) / 100);
    valorPaspaturPrincipal = cp * (1 + Number(P.paspatur.profit_margin) / 100);
  }

  let valorPaspaturAdicional = 0;
  if (
    snap.paspaturAtivo === "sim" &&
    snap.paspaturAdicionalAtivo === "sim" &&
    P.paspaturAdicional &&
    larguraAdicional > 0 &&
    alturaAdicional > 0
  ) {
    const area = (larguraAdicional * alturaAdicional) / 10000;
    const base = area * Number(P.paspaturAdicional.value_per_meter);
    const cp = base * (1 + Number(P.paspaturAdicional.waste_percentage) / 100);
    valorPaspaturAdicional = cp * (1 + Number(P.paspaturAdicional.profit_margin) / 100);
  }

  const valorPaspatur = valorPaspaturPrincipal + valorPaspaturAdicional;

  let valorPerfilPrincipal = 0;
  if (P.perfil && alturaFinal > 0 && larguraFinal > 0) {
    const perim = ((alturaFinal + larguraFinal) * 2) / 100;
    const base = perim * Number(P.perfil.value_per_meter);
    const cp = base * (1 + Number(P.perfil.waste_percentage) / 100);
    valorPerfilPrincipal = cp * (1 + Number(P.perfil.profit_margin) / 100);
  }

  // Perfil adicional: usa medidas finais + largura da moldura do perfil principal nos 2 lados
  const fwPrincipal = Number(P.perfil?.frame_width_cm ?? 0) || 0;
  const larguraPerfilAdicional = larguraFinal + fwPrincipal * 2;
  const alturaPerfilAdicional = alturaFinal + fwPrincipal * 2;
  let valorPerfilAdicional = 0;
  if (
    snap.perfilAdicionalAtivo === "sim" &&
    P.perfilAdicional &&
    larguraPerfilAdicional > 0 &&
    alturaPerfilAdicional > 0
  ) {
    const perim = ((alturaPerfilAdicional + larguraPerfilAdicional) * 2) / 100;
    const base = perim * Number(P.perfilAdicional.value_per_meter);
    const cp = base * (1 + Number(P.perfilAdicional.waste_percentage) / 100);
    valorPerfilAdicional = cp * (1 + Number(P.perfilAdicional.profit_margin) / 100);
  }
  const valorPerfil = valorPerfilPrincipal + valorPerfilAdicional;

  const vidroQuantidade = Math.max(1, Math.floor(parseNum(snap.vidroQuantidade || "1")) || 1);
  const valorVidroUnit =
    snap.vidroTipo === "sim" ? calcAreaValue(P.vidro, alturaFinal, larguraFinal) : 0;
  const valorVidro = valorVidroUnit * (snap.vidroTipo === "sim" ? vidroQuantidade : 0);
  const valorFoam = calcAreaValue(P.foam, alturaFinal, larguraFinal);
  const valorColagem =
    snap.colagemAtivo === "sim"
      ? calcAreaValue(P.colagem, alturaFinal, larguraFinal)
      : 0;
  const valorImpressao =
    snap.impressaoAtivo === "sim"
      ? calcAreaValue(P.impressao, alturaFinal, larguraFinal)
      : 0;

  const diversosItens = (snap.produtosDiversos ?? []).map((di) => {
    const qtd = Math.max(1, Math.floor(Number(di.quantidade) || 1));
    const unit = Number(di.valorUnitario) || 0;
    return { ...di, quantidade: qtd, valorUnitario: unit, total: unit * qtd };
  });
  const valorDiversos = diversosItens.reduce((s, di) => s + di.total, 0);

  const subtotal =
    valorPaspatur + valorPerfil + valorVidro + valorFoam + valorColagem + valorImpressao + valorDiversos;

  return {
    alturaNum,
    larguraNum,
    mEsq,
    mDir,
    mSup,
    mInf,
    alturaFinal,
    larguraFinal,
    mEsqA,
    mDirA,
    mSupA,
    mInfA,
    alturaAdicional,
    larguraAdicional,
    valorPaspaturPrincipal,
    valorPaspaturAdicional,
    valorPaspatur,
    valorPerfil,
    valorPerfilPrincipal,
    valorPerfilAdicional,
    larguraPerfilAdicional,
    alturaPerfilAdicional,
    valorVidroUnit,
    valorVidro,
    vidroQuantidade,
    valorFoam,
    valorColagem,
    valorImpressao,
    diversosItens,
    valorDiversos,
    subtotal,
  };
}

function buildItemDetails(
  snap: ItemSnapshot,
  v: ItemValues,
  P: {
    paspatur: Produto | null;
    paspaturAdicional: Produto | null;
    perfil: Produto | null;
    perfilAdicional: Produto | null;
    vidro: Produto | null;
    foam: Produto | null;
    colagem: Produto | null;
    impressao: Produto | null;
  },
) {
  return {
    altura: snap.altura,
    largura: snap.largura,
    alturaOriginal: v.alturaNum,
    larguraOriginal: v.larguraNum,
    alturaFinal: v.alturaFinal,
    larguraFinal: v.larguraFinal,
    paspaturAtivo: snap.paspaturAtivo,
    paspaturId: snap.paspaturId,
    paspaturCode: P.paspatur?.code ?? null,
    paspaturDescription: P.paspatur?.description ?? null,
    valorPaspatur: Number(v.valorPaspatur.toFixed(2)),
    valorPaspaturPrincipal: Number(v.valorPaspaturPrincipal.toFixed(2)),
    valorPaspaturAdicional: Number(v.valorPaspaturAdicional.toFixed(2)),
    margemEsq: snap.margemEsq,
    margemDir: snap.margemDir,
    margemSup: snap.margemSup,
    margemInf: snap.margemInf,
    paspaturAdicionalAtivo: snap.paspaturAdicionalAtivo,
    paspaturAdicionalObs: snap.paspaturAdicionalObs,
    paspaturAdicionalEsq: snap.paspaturAdicionalEsq,
    paspaturAdicionalDir: snap.paspaturAdicionalDir,
    paspaturAdicionalSup: snap.paspaturAdicionalSup,
    paspaturAdicionalInf: snap.paspaturAdicionalInf,
    paspaturAdicionalId: snap.paspaturAdicionalId,
    paspaturAdicionalCode: P.paspaturAdicional?.code ?? null,
    paspaturAdicionalDescription: P.paspaturAdicional?.description ?? null,
    larguraAdicional: v.larguraAdicional,
    alturaAdicional: v.alturaAdicional,
    perfilId: snap.perfilId,
    perfilCode: P.perfil?.code ?? null,
    perfilDescription: P.perfil?.description ?? null,
    perfilFrameWidthCm: P.perfil?.frame_width_cm ?? null,
    valorPerfil: Number(v.valorPerfil.toFixed(2)),
    valorPerfilPrincipal: Number(v.valorPerfilPrincipal.toFixed(2)),
    valorPerfilAdicional: Number(v.valorPerfilAdicional.toFixed(2)),
    perfilAdicionalAtivo: snap.perfilAdicionalAtivo,
    perfilAdicionalId: snap.perfilAdicionalId,
    perfilAdicionalCode: P.perfilAdicional?.code ?? null,
    perfilAdicionalDescription: P.perfilAdicional?.description ?? null,
    larguraPerfilAdicional: v.larguraPerfilAdicional,
    alturaPerfilAdicional: v.alturaPerfilAdicional,
    vidroTipo: snap.vidroTipo,
    vidroId: snap.vidroId,
    vidroCode: P.vidro?.code ?? null,
    vidroDescription: P.vidro?.description ?? null,
    vidroQuantidade: v.vidroQuantidade,
    valorVidroUnit: Number(v.valorVidroUnit.toFixed(2)),
    valorVidro: Number(v.valorVidro.toFixed(2)),
    foamId: snap.foamId,
    foamCode: P.foam?.code ?? null,
    foamDescription: P.foam?.description ?? null,
    valorFoam: Number(v.valorFoam.toFixed(2)),
    colagemAtivo: snap.colagemAtivo,
    colagemId: snap.colagemId,
    colagemCode: P.colagem?.code ?? null,
    colagemDescription: P.colagem?.description ?? null,
    valorColagem: Number(v.valorColagem.toFixed(2)),
    impressaoAtivo: snap.impressaoAtivo,
    impressaoId: snap.impressaoId,
    impressaoCode: P.impressao?.code ?? null,
    impressaoDescription: P.impressao?.description ?? null,
    valorImpressao: Number(v.valorImpressao.toFixed(2)),
    produtosDiversos: v.diversosItens.map((di) => ({
      uid: di.uid,
      productId: di.productId,
      code: di.code,
      nome: di.nome,
      valorUnitario: Number(di.valorUnitario.toFixed(2)),
      quantidade: di.quantidade,
      total: Number(di.total.toFixed(2)),
    })),
    valorDiversos: Number(v.valorDiversos.toFixed(2)),
    subtotal: Number(v.subtotal.toFixed(2)),
  };
}

// Hydrate an ItemSnapshot from a saved details jsonb (used for legacy details and budget_items.data)
function snapshotFromDetails(d: Record<string, unknown>): ItemSnapshot {
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const rawDiv = Array.isArray(d.produtosDiversos) ? (d.produtosDiversos as unknown[]) : [];
  const produtosDiversos: DiversoItem[] = rawDiv.map((raw, idx) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      uid: typeof r.uid === "string" ? (r.uid as string) : `d-${idx}-${Date.now()}`,
      productId: typeof r.productId === "string" ? (r.productId as string) : "",
      code: typeof r.code === "string" ? (r.code as string) : "",
      nome: typeof r.nome === "string" ? (r.nome as string) : "",
      valorUnitario: Number(r.valorUnitario) || 0,
      quantidade: Math.max(1, Math.floor(Number(r.quantidade) || 1)),
    };
  });
  const vq =
    typeof d.vidroQuantidade === "number"
      ? String(d.vidroQuantidade)
      : typeof d.vidroQuantidade === "string"
        ? (d.vidroQuantidade as string)
        : "1";
  return {
    altura: s("altura"),
    largura: s("largura"),
    paspaturAtivo: d.paspaturAtivo === "sim" ? "sim" : "nao",
    margemEsq: s("margemEsq"),
    margemDir: s("margemDir"),
    margemSup: s("margemSup"),
    margemInf: s("margemInf"),
    paspaturId: s("paspaturId"),
    paspaturAdicionalAtivo: d.paspaturAdicionalAtivo === "sim" ? "sim" : "nao",
    paspaturAdicionalObs: s("paspaturAdicionalObs"),
    paspaturAdicionalEsq: s("paspaturAdicionalEsq"),
    paspaturAdicionalDir: s("paspaturAdicionalDir"),
    paspaturAdicionalSup: s("paspaturAdicionalSup"),
    paspaturAdicionalInf: s("paspaturAdicionalInf"),
    paspaturAdicionalId: s("paspaturAdicionalId"),
    perfilId: s("perfilId"),
    perfilAdicionalAtivo: d.perfilAdicionalAtivo === "sim" ? "sim" : "nao",
    perfilAdicionalId: s("perfilAdicionalId"),
    vidroTipo: d.vidroTipo === "sim" ? "sim" : "nao",
    vidroId: s("vidroId"),
    vidroQuantidade: vq || "1",
    foamId: s("foamId"),
    colagemAtivo: d.colagemAtivo === "sim" ? "sim" : "nao",
    colagemId: s("colagemId"),
    impressaoAtivo: d.impressaoAtivo === "sim" ? "sim" : "nao",
    impressaoId: s("impressaoId"),
    produtosDiversos,
  };
}

function NovoOrcamento() {
  const navigate = useNavigate();
  const { session, ownerUserId } = useAuth();
  const queryClient = useQueryClient();
  const { id: editId } = Route.useSearch();
  const isEdit = !!editId;

  const [active, setActive] = useState<StepKey>("tamanho");

  // Items list (persisted snapshots) and which one is active
  const [items, setItems] = useState<ItemSnapshot[]>([{ ...emptyItem }]);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  // Active item state (mirrors items[activeIndex] for editing)
  const [altura, setAltura] = useState<string>("");
  const [largura, setLargura] = useState<string>("");
  const [paspaturAtivo, setPaspaturAtivo] = useState<"sim" | "nao">("nao");
  const [margemEsq, setMargemEsq] = useState<string>("");
  const [margemDir, setMargemDir] = useState<string>("");
  const [margemSup, setMargemSup] = useState<string>("");
  const [margemInf, setMargemInf] = useState<string>("");
  const [paspaturId, setPaspaturId] = useState<string>("");
  const [paspaturAdicionalAtivo, setPaspaturAdicionalAtivo] = useState<"sim" | "nao">("nao");
  const [paspaturAdicionalObs, setPaspaturAdicionalObs] = useState<string>("");
  const [paspaturAdicionalEsq, setPaspaturAdicionalEsq] = useState<string>("");
  const [paspaturAdicionalDir, setPaspaturAdicionalDir] = useState<string>("");
  const [paspaturAdicionalSup, setPaspaturAdicionalSup] = useState<string>("");
  const [paspaturAdicionalInf, setPaspaturAdicionalInf] = useState<string>("");
  const [paspaturAdicionalId, setPaspaturAdicionalId] = useState<string>("");
  const [perfilId, setPerfilId] = useState<string>("");
  const [perfilAdicionalAtivo, setPerfilAdicionalAtivo] = useState<"sim" | "nao">("nao");
  const [perfilAdicionalId, setPerfilAdicionalId] = useState<string>("");
  const [vidroTipo, setVidroTipo] = useState<"sim" | "nao">("nao");
  const [vidroId, setVidroId] = useState<string>("");
  const [vidroQuantidade, setVidroQuantidade] = useState<string>("1");
  const [foamId, setFoamId] = useState<string>("");
  const [colagemAtivo, setColagemAtivo] = useState<"sim" | "nao">("nao");
  const [colagemId, setColagemId] = useState<string>("");
  const [impressaoAtivo, setImpressaoAtivo] = useState<"sim" | "nao">("nao");
  const [impressaoId, setImpressaoId] = useState<string>("");
  const [impressaoArquivo, setImpressaoArquivo] = useState<File | null>(null);
  const [produtosDiversos, setProdutosDiversos] = useState<DiversoItem[]>([]);

  // Budget-level (geral)
  const [instalacaoAtivo, setInstalacaoAtivo] = useState<"sim" | "nao">("nao");
  const [valorInstalacaoStr, setValorInstalacaoStr] = useState<string>("");
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>("Retirada");
  const [valorEntregaStr, setValorEntregaStr] = useState<string>("");
  const [clienteNome, setClienteNome] = useState<string>("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clientePickerOpen, setClientePickerOpen] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagto>("Dinheiro");
  const [maoDeObraExtraStr, setMaoDeObraExtraStr] = useState<string>("");
  const [dataVencimento, setDataVencimento] = useState<string>("");
  const [observacoes, setObservacoes] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);


  const { data: perfis = [], isLoading: loadingPerfis } = useCategoryProducts(
    ["Perfil"],
    !!session,
  );
  const { data: vidros = [], isLoading: loadingVidros } = useCategoryProducts(
    ["Vidro"],
    !!session,
  );
  const { data: foams = [], isLoading: loadingFoams } = useCategoryProducts(
    ["Foam", "MDF"],
    !!session,
  );
  const { data: paspaturs = [], isLoading: loadingPaspaturs } = useCategoryProducts(
    ["Paspatur"],
    !!session,
  );
  const { data: colagens = [], isLoading: loadingColagens } = useCategoryProducts(
    ["Colagem"],
    !!session,
  );
  const { data: impressoes = [], isLoading: loadingImpressoes } = useCategoryProducts(
    ["Impressão", "Impressao"],
    !!session,
  );
  const { data: diversosProdutos = [], isLoading: loadingDiversos } = useCategoryProducts(
    ["produtos_diversos"],
    !!session,
  );

  // Lista de clientes (escopo: dono / colaboradores via RLS)
  const { data: clientes = [] } = useQuery({
    queryKey: ["clients", "picker"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, phone, document")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });


  // Resolve products for an arbitrary snapshot (used for non-active items)
  function resolveProducts(snap: ItemSnapshot) {
    return {
      paspatur: paspaturs.find((p) => p.id === snap.paspaturId) ?? null,
      paspaturAdicional: paspaturs.find((p) => p.id === snap.paspaturAdicionalId) ?? null,
      perfil: perfis.find((p) => p.id === snap.perfilId) ?? null,
      perfilAdicional: perfis.find((p) => p.id === snap.perfilAdicionalId) ?? null,
      vidro: vidros.find((p) => p.id === snap.vidroId) ?? null,
      foam: foams.find((p) => p.id === snap.foamId) ?? null,
      colagem: colagens.find((p) => p.id === snap.colagemId) ?? null,
      impressao: impressoes.find((p) => p.id === snap.impressaoId) ?? null,
    };
  }

  // Current active snapshot derived from state
  const activeSnap: ItemSnapshot = useMemo(
    () => ({
      altura,
      largura,
      paspaturAtivo,
      margemEsq,
      margemDir,
      margemSup,
      margemInf,
      paspaturId,
      paspaturAdicionalAtivo,
      paspaturAdicionalObs,
      paspaturAdicionalEsq,
      paspaturAdicionalDir,
      paspaturAdicionalSup,
      paspaturAdicionalInf,
      paspaturAdicionalId,
      perfilId,
      perfilAdicionalAtivo,
      perfilAdicionalId,
      vidroTipo,
      vidroId,
      vidroQuantidade,
      foamId,
      colagemAtivo,
      colagemId,
      impressaoAtivo,
      impressaoId,
      produtosDiversos,
    }),
    [
      altura,
      largura,
      paspaturAtivo,
      margemEsq,
      margemDir,
      margemSup,
      margemInf,
      paspaturId,
      paspaturAdicionalAtivo,
      paspaturAdicionalObs,
      paspaturAdicionalEsq,
      paspaturAdicionalDir,
      paspaturAdicionalSup,
      paspaturAdicionalInf,
      paspaturAdicionalId,
      perfilId,
      perfilAdicionalAtivo,
      perfilAdicionalId,
      vidroTipo,
      vidroId,
      vidroQuantidade,
      foamId,
      colagemAtivo,
      colagemId,
      impressaoAtivo,
      impressaoId,
      produtosDiversos,
    ],
  );

  const activeProducts = useMemo(
    () => resolveProducts(activeSnap),
    // products lists change rarely; recompute when ids change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSnap, perfis, vidros, foams, paspaturs, colagens, impressoes],
  );

  const activeValues = useMemo(
    () => computeItemValues(activeSnap, activeProducts),
    [activeSnap, activeProducts],
  );

  const {
    alturaNum,
    larguraNum,
    mEsq,
    mDir,
    mSup,
    mInf,
    mEsqA,
    mDirA,
    mSupA,
    mInfA,
    alturaFinal,
    larguraFinal,
    larguraAdicional,
    alturaAdicional,
    valorPaspatur,
    valorPaspaturPrincipal,
    valorPaspaturAdicional,
    valorPerfil,
    valorPerfilPrincipal,
    valorPerfilAdicional,
    larguraPerfilAdicional,
    alturaPerfilAdicional,
    valorVidro,
    valorVidroUnit,
    vidroQuantidade: vidroQuantidadeNum,
    valorFoam,
    valorColagem,
    valorImpressao,
    diversosItens,
    valorDiversos,
  } = activeValues;

  // Lado-a-lado: paspatur adicional não pode ter margem maior que o principal
  const paspaturAdicionalInvalido =
    paspaturAtivo === "sim" &&
    paspaturAdicionalAtivo === "sim" &&
    (mEsqA > mEsq || mDirA > mDir || mSupA > mSup || mInfA > mInf);

  // Compute all items' subtotals (using active state for the active index)
  const itemSubtotals = useMemo(() => {
    return items.map((snap, i) => {
      if (i === activeIndex) return activeValues.subtotal;
      return computeItemValues(snap, resolveProducts(snap)).subtotal;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, activeIndex, activeValues, perfis, vidros, foams, paspaturs, colagens, impressoes]);

  const subtotalItens = useMemo(
    () => itemSubtotals.reduce((a, b) => a + b, 0),
    [itemSubtotals],
  );

  const valorInstalacao =
    instalacaoAtivo === "sim" ? parseNum(valorInstalacaoStr) : 0;
  const valorEntrega =
    tipoEntrega === "Retirada" ? 0 : parseNum(valorEntregaStr);
  const maoDeObraExtra = parseNum(maoDeObraExtraStr);

  const valorTotal = subtotalItens + valorInstalacao + valorEntrega + maoDeObraExtra;

  // Container-aware preview sizing (mobile-safe).
  // We measure the wrapper width and reserve room for the right-side "altura" label.
  const previewArtRef = useRef<HTMLDivElement | null>(null);
  const previewPaspaturRef = useRef<HTMLDivElement | null>(null);
  const [previewArtCW, setPreviewArtCW] = useState(320);
  const [previewPaspaturCW, setPreviewPaspaturCW] = useState(360);

  useEffect(() => {
    const targets: Array<[HTMLDivElement | null, (n: number) => void]> = [
      [previewArtRef.current, setPreviewArtCW],
      [previewPaspaturRef.current, setPreviewPaspaturCW],
    ];
    const observers: ResizeObserver[] = [];
    targets.forEach(([el, setter]) => {
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) setter(e.contentRect.width);
      });
      ro.observe(el);
      observers.push(ro);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [active]);

  // Reserve ~56px for the right-side "altura CM" label + gap.
  const RIGHT_LABEL_RESERVE = 56;

  // Preview Tamanho
  const previewArt = useMemo(() => {
    const maxW = Math.max(80, Math.min(320, previewArtCW - RIGHT_LABEL_RESERVE));
    const maxH = 240;
    const a = alturaNum > 0 ? alturaNum : 0;
    const l = larguraNum > 0 ? larguraNum : 0;
    if (a === 0 && l === 0) {
      const w = Math.min(200, maxW);
      return { w, h: Math.round(w * 0.75), empty: true };
    }
    const scale = Math.min(maxW / (l || 1), maxH / (a || 1));
    return {
      w: Math.max(40, Math.round((l || 1) * scale)),
      h: Math.max(40, Math.round((a || 1) * scale)),
      empty: false,
    };
  }, [alturaNum, larguraNum, previewArtCW]);

  const previewPaspatur = useMemo(() => {
    const maxW = Math.max(80, Math.min(360, previewPaspaturCW - RIGHT_LABEL_RESERVE));
    const maxH = 280;
    const lf = larguraFinal > 0 ? larguraFinal : Math.max(larguraNum, 1);
    const af = alturaFinal > 0 ? alturaFinal : Math.max(alturaNum, 1);
    const scale = Math.min(maxW / lf, maxH / af);
    const adicionalOn = paspaturAdicionalAtivo === "sim";
    // When adicional is active, the principal layer's visible band is the
    // DIFFERENCE between principal and adicional margins (gap between the two
    // frames), and the adicional layer itself accounts for the adicional margin
    // down to the art. When inactive, the principal occupies the full margin.
    const gapEsq = adicionalOn ? Math.max(0, mEsq - mEsqA) : mEsq;
    const gapDir = adicionalOn ? Math.max(0, mDir - mDirA) : mDir;
    const gapSup = adicionalOn ? Math.max(0, mSup - mSupA) : mSup;
    const gapInf = adicionalOn ? Math.max(0, mInf - mInfA) : mInf;
    return {
      outerW: Math.max(60, Math.round(lf * scale)),
      outerH: Math.max(60, Math.round(af * scale)),
      padLeft: Math.round(gapEsq * scale),
      padRight: Math.round(gapDir * scale),
      padTop: Math.round(gapSup * scale),
      padBottom: Math.round(gapInf * scale),
      adicionalOn,
      adPadLeft: Math.round(Math.min(mEsqA, mEsq) * scale),
      adPadRight: Math.round(Math.min(mDirA, mDir) * scale),
      adPadTop: Math.round(Math.min(mSupA, mSup) * scale),
      adPadBottom: Math.round(Math.min(mInfA, mInf) * scale),
      scale,
    };
  }, [
    larguraFinal,
    alturaFinal,
    larguraNum,
    alturaNum,
    mEsq,
    mDir,
    mSup,
    mInf,
    mEsqA,
    mDirA,
    mSupA,
    mInfA,
    paspaturAdicionalAtivo,
    previewPaspaturCW,
  ]);
  const paspaturAdicionalSelecionado = activeProducts.paspaturAdicional;

  // Selected products (active item) for "selected info" cards
  const perfilSelecionado = activeProducts.perfil;
  const perfilAdicionalSelecionado = activeProducts.perfilAdicional;
  const vidroSelecionado = activeProducts.vidro;
  const foamSelecionado = activeProducts.foam;
  const paspaturSelecionado = activeProducts.paspatur;
  const colagemSelecionada = activeProducts.colagem;
  const impressaoSelecionada = activeProducts.impressao;

  // --- Item navigation helpers ---
  function loadSnapshotIntoState(s: ItemSnapshot) {
    setAltura(s.altura);
    setLargura(s.largura);
    setPaspaturAtivo(s.paspaturAtivo);
    setMargemEsq(s.margemEsq);
    setMargemDir(s.margemDir);
    setMargemSup(s.margemSup);
    setMargemInf(s.margemInf);
    setPaspaturId(s.paspaturId);
    setPaspaturAdicionalAtivo(s.paspaturAdicionalAtivo);
    setPaspaturAdicionalObs(s.paspaturAdicionalObs);
    setPaspaturAdicionalEsq(s.paspaturAdicionalEsq);
    setPaspaturAdicionalDir(s.paspaturAdicionalDir);
    setPaspaturAdicionalSup(s.paspaturAdicionalSup);
    setPaspaturAdicionalInf(s.paspaturAdicionalInf);
    setPaspaturAdicionalId(s.paspaturAdicionalId);
    setPerfilId(s.perfilId);
    setPerfilAdicionalAtivo(s.perfilAdicionalAtivo);
    setPerfilAdicionalId(s.perfilAdicionalId);
    setVidroTipo(s.vidroTipo);
    setVidroId(s.vidroId);
    setVidroQuantidade(s.vidroQuantidade || "1");
    setFoamId(s.foamId);
    setColagemAtivo(s.colagemAtivo);
    setColagemId(s.colagemId);
    setImpressaoAtivo(s.impressaoAtivo);
    setImpressaoId(s.impressaoId);
    setImpressaoArquivo(null);
    setProdutosDiversos(s.produtosDiversos ?? []);
  }

  function selectItem(index: number) {
    if (index === activeIndex) return;
    // Capture current active state into items, then load target
    const captured = activeSnap;
    setItems((prev) => {
      const next = [...prev];
      next[activeIndex] = captured;
      return next;
    });
    setActiveIndex(index);
    loadSnapshotIntoState(items[index]);
    setActive("tamanho");
  }

  function addNewItem() {
    // Save current as snapshot, append blank, switch to it
    const captured = activeSnap;
    setItems((prev) => {
      const next = [...prev];
      next[activeIndex] = captured;
      next.push({ ...emptyItem });
      return next;
    });
    const newIndex = items.length; // because we will push one
    setActiveIndex(newIndex);
    loadSnapshotIntoState({ ...emptyItem });
    setActive("tamanho");
  }

  function deleteItem(index: number) {
    if (items.length <= 1) {
      toast.warning("É necessário manter pelo menos um item no orçamento.");
      return;
    }
    const captured = activeSnap;
    const current = items.map((it, i) => (i === activeIndex ? captured : it));
    const next = current.filter((_, i) => i !== index);
    let newActive = activeIndex;
    if (index === activeIndex) {
      newActive = Math.max(0, index - 1);
    } else if (index < activeIndex) {
      newActive = activeIndex - 1;
    }
    setItems(next);
    setActiveIndex(newActive);
    loadSnapshotIntoState(next[newActive]);
    toast.success("Item excluído.");
  }

  function cloneItem(sourceIndex: number) {
    const captured = activeSnap;
    const current = items.map((it, i) => (i === activeIndex ? captured : it));
    const clone = { ...current[sourceIndex] };
    const next = [...current, clone];
    const newIndex = next.length - 1;
    setItems(next);
    setActiveIndex(newIndex);
    loadSnapshotIntoState(clone);
    setActive("tamanho");
    toast.success(`Item ${sourceIndex + 1} clonado.`);
  }


  // Carregar orçamento existente para edição
  const [loadedId, setLoadedId] = useState<string | null>(null);
  useEffect(() => {
    if (!isEdit || !editId || !session?.user?.id) return;
    if (loadedId === editId) return;
    let cancelled = false;
    (async () => {
      const { data: budget, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("id", editId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !budget) {
        toast.error("Não foi possível carregar o orçamento.");
        return;
      }
      const d = (budget.details ?? {}) as Record<string, unknown>;
      const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");

      setClienteNome(budget.client_name ?? "");
      setClienteId((budget as { client_id?: string | null }).client_id ?? null);
      setFormaPagamento((d.formaPagamento as FormaPagto) ?? "Dinheiro");
      setMaoDeObraExtraStr(s("maoDeObraExtraStr"));
      setDataVencimento(budget.data_vencimento ?? "");
      setObservacoes(s("observacoes"));
      setInstalacaoAtivo(d.instalacaoAtivo === "sim" ? "sim" : "nao");
      setValorInstalacaoStr(s("valorInstalacaoStr"));
      setTipoEntrega((d.tipoEntrega as TipoEntrega) ?? "Retirada");
      setValorEntregaStr(s("valorEntregaStr"));

      // Load items
      const { data: itemRows } = await supabase
        .from("budget_items")
        .select("data, position")
        .eq("budget_id", editId)
        .order("position", { ascending: true });
      if (cancelled) return;

      let loaded: ItemSnapshot[] = [];
      if (itemRows && itemRows.length > 0) {
        loaded = itemRows.map((r) =>
          snapshotFromDetails((r.data ?? {}) as Record<string, unknown>),
        );
      } else {
        // Legacy: derive single item from budget.details
        loaded = [snapshotFromDetails(d)];
      }
      if (loaded.length === 0) loaded = [{ ...emptyItem }];
      setItems(loaded);
      setActiveIndex(0);
      loadSnapshotIntoState(loaded[0]);
      setLoadedId(editId);
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, editId, session?.user?.id, loadedId]);

  async function handleSalvar(opts: { approve?: boolean } = {}) {
    const approve = !!opts.approve;
    if (!session?.user?.id) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }
    if (!clienteNome.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    if (valorTotal <= 0) {
      toast.error("Valor total inválido. Verifique os itens do orçamento.");
      return;
    }

    // Persist current state into items
    const captured = activeSnap;
    const allItems = items.map((it, i) => (i === activeIndex ? captured : it));

    // Validate: paspatur adicional margens não podem ser maiores que o principal
    for (let i = 0; i < allItems.length; i++) {
      const it = allItems[i];
      if (it.paspaturAtivo !== "sim" || it.paspaturAdicionalAtivo !== "sim") continue;
      const me = parseNum(it.margemEsq), md = parseNum(it.margemDir);
      const ms = parseNum(it.margemSup), mi = parseNum(it.margemInf);
      const ae = parseNum(it.paspaturAdicionalEsq), ad = parseNum(it.paspaturAdicionalDir);
      const as = parseNum(it.paspaturAdicionalSup), ai = parseNum(it.paspaturAdicionalInf);
      if (ae > me || ad > md || as > ms || ai > mi) {
        toast.error(
          `Item ${i + 1}: o paspatur adicional não pode ter margem maior que o paspatur principal.`,
        );
        return;
      }
    }

    // Build items payload with values and details
    const itemsPayload = allItems.map((snap, idx) => {
      const P = resolveProducts(snap);
      const v = computeItemValues(snap, P);
      return {
        position: idx + 1,
        subtotal: Number(v.subtotal.toFixed(2)),
        data: buildItemDetails(snap, v, P),
      };
    });

    if (approve) setAprovando(true);
    else setSalvando(true);
    try {
      const generalDetails = {
        formaPagamento,
        observacoes,
        maoDeObraExtraStr,
        maoDeObraExtra: Number(maoDeObraExtra.toFixed(2)),
        instalacaoAtivo,
        valorInstalacaoStr,
        valorInstalacao: Number(valorInstalacao.toFixed(2)),
        tipoEntrega,
        valorEntregaStr,
        valorEntrega: Number(valorEntrega.toFixed(2)),
      };

      const budgetPayload = {
        client_name: clienteNome.trim(),
        client_id: clienteId,
        total_value: Number(valorTotal.toFixed(2)),
        data_vencimento: dataVencimento || null,
        details: generalDetails as never,
        ...(approve ? { status: "Aprovado" } : {}),
      };

      let budgetId: string;
      let budgetNumber: string | null = null;
      if (isEdit && editId) {
        const { error } = await supabase
          .from("budgets")
          .update(budgetPayload)
          .eq("id", editId);
        if (error) throw error;
        budgetId = editId;
        const { data: b } = await supabase
          .from("budgets")
          .select("number")
          .eq("id", editId)
          .maybeSingle();
        budgetNumber = b?.number ?? null;
      } else {
        const number = `ORC-${Date.now().toString().slice(-8)}`;
        const { data: inserted, error } = await supabase
          .from("budgets")
          .insert({
            user_id: ownerUserId ?? session.user.id,
            number,
            status: approve ? "Aprovado" : "Pendente",
            ...budgetPayload,
          })
          .select("id, number")
          .single();
        if (error) throw error;
        budgetId = inserted.id;
        budgetNumber = inserted.number;
      }

      // Replace items: delete then insert
      const { error: delErr } = await supabase
        .from("budget_items")
        .delete()
        .eq("budget_id", budgetId);
      if (delErr) throw delErr;

      const insertRows = itemsPayload.map((it) => ({
        budget_id: budgetId,
        user_id: ownerUserId ?? session.user.id,
        position: it.position,
        subtotal: it.subtotal,
        data: it.data as never,
      }));
      const { error: insErr } = await supabase.from("budget_items").insert(insertRows);
      if (insErr) throw insErr;

      // Pedido (somente quando aprovar)
      if (approve) {
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("id")
          .eq("budget_id", budgetId)
          .maybeSingle();
        const orderPayload = {
          client_name: clienteNome.trim(),
          total_value: Number(valorTotal.toFixed(2)),
          status: "Aprovado",
        };
        if (existingOrder?.id) {
          const { error: updErr } = await supabase
            .from("orders")
            .update(orderPayload)
            .eq("id", existingOrder.id);
          if (updErr) throw updErr;
        } else {
          const orderNumber = budgetNumber
            ? `PED-${budgetNumber.replace(/^ORC-/, "")}`
            : `PED-${Date.now().toString().slice(-8)}`;
          const { error: insOrdErr } = await supabase.from("orders").insert({
            user_id: ownerUserId ?? session.user.id,
            number: orderNumber,
            budget_id: budgetId,
            ...orderPayload,
          });
          if (insOrdErr) throw insOrdErr;
        }
      }

      toast.success(
        approve
          ? "Orçamento aprovado e pedido gerado!"
          : isEdit
            ? "Orçamento atualizado com sucesso!"
            : "Orçamento salvo com sucesso!",
      );
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      if (approve) await queryClient.invalidateQueries({ queryKey: ["orders"] });
      navigate({ to: approve ? "/pedidos" : "/orcamentos" });
    } catch (e) {
      console.error(e);
      toast.error(
        approve
          ? "Não foi possível aprovar o orçamento."
          : "Não foi possível salvar o orçamento.",
      );
    } finally {
      setSalvando(false);
      setAprovando(false);
    }
  }


  return (
    <AppShell
      title={isEdit ? "Editar Orçamento" : "Novo Orçamento"}
      subtitle="Monte o orçamento por etapas"
    >
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={() => setShowExitDialog(true)}
          className="inline-flex items-center justify-center rounded-md h-8 w-8 border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          aria-label="Sair"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Sidebar: Items + Stepper */}
        <div className="space-y-4 h-fit">
          <Card className="p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground px-2 mb-2">
              Itens do orçamento
            </div>
            <div className="space-y-1">
              {items.map((_, i) => {
                const isActive = i === activeIndex;
                const canDelete = items.length > 1;
                return (
                  <ContextMenu key={i}>
                    <ContextMenuTrigger asChild>
                      <div
                        className={cn(
                          "group flex items-center rounded-md transition-all",
                          isActive
                            ? "bg-accent text-foreground font-medium"
                            : "hover:bg-accent/60 text-foreground/80",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => selectItem(i)}
                          className="flex-1 flex items-center justify-between px-3 py-2 text-sm text-left min-w-0"
                        >
                          <span>Item {i + 1}</span>
                          <span className="text-xs font-medium text-muted-foreground ml-2">
                            {fmtMoney(itemSubtotals[i] ?? 0)}
                          </span>
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label="Ações do item"
                              onClick={(e) => e.stopPropagation()}
                              className="px-2 py-2 text-muted-foreground hover:text-foreground rounded-md"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={!canDelete}
                              onClick={() => setDeleteIndex(i)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              Excluir item
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        disabled={!canDelete}
                        onClick={() => setDeleteIndex(i)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir item
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}

            </div>
          </Card>

          <Card className="p-3">
            <nav className="space-y-1">
              {steps.map((s) => {
                const isActive = active === s.key;
                const Icon = s.icon;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setActive(s.key)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all text-left",
                      isActive
                        ? "bg-gradient-brand text-brand-foreground shadow-brand"
                        : "text-foreground/80 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{s.label}</span>
                  </button>
                );
              })}
            </nav>
          </Card>
        </div>

        {/* Content area */}
        <div className="space-y-6">
          {/* Totals header */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-foreground">
                Item {activeIndex + 1}{" "}
                <span className="text-muted-foreground font-normal">
                  · Subtotal {fmtMoney(activeValues.subtotal)}
                </span>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Total geral
                </div>
                <div className="text-2xl font-bold bg-gradient-brand bg-clip-text text-transparent">
                  {fmtMoney(valorTotal)}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3">
              <Total label="Paspatur" value={valorPaspatur} />
              <Total label="Perfil" value={valorPerfil} />
              <Total label="Vidro" value={valorVidro} />
              <Total label="Foam/MDF" value={valorFoam} />
              <Total label="Colagem" value={valorColagem} />
              <Total label="Impressão" value={valorImpressao} />
              <Total label="Diversos" value={valorDiversos} />
            </div>
            {(mEsq > 0 || mDir > 0 || mSup > 0 || mInf > 0) &&
              alturaNum > 0 &&
              larguraNum > 0 && (
                <div className="mt-3 text-xs text-muted-foreground text-right">
                  Medidas finais (com paspatur):{" "}
                  <span className="font-medium text-foreground">
                    {larguraFinal} × {alturaFinal} cm
                  </span>
                </div>
              )}
          </Card>

          {active === "tamanho" && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold">
                Qual o tamanho do que deseja emoldurar?
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Lembre-se de utilizar os tamanhos sempre em centímetros
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 max-w-md">
                <div className="space-y-1.5">
                  <Label htmlFor="altura">Altura (cm)</Label>
                  <Input
                    id="altura"
                    inputMode="decimal"
                    placeholder="0"
                    value={altura}
                    onChange={(e) => setAltura(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="largura">Largura (cm)</Label>
                  <Input
                    id="largura"
                    inputMode="decimal"
                    placeholder="0"
                    value={largura}
                    onChange={(e) => setLargura(e.target.value)}
                  />
                </div>
              </div>

              <div ref={previewArtRef} className="mt-10 w-full overflow-hidden flex justify-center">
                <div className="inline-flex items-start gap-4 max-w-full">
                  <div className="flex flex-col items-center min-w-0">
                    <div
                      className={cn(
                        "border-2 border-foreground/70 rounded-sm bg-muted/30 transition-all max-w-full",
                        previewArt.empty && "border-dashed opacity-50",
                      )}
                      style={{ width: previewArt.w, height: previewArt.h }}
                    />
                    <div className="mt-3 text-sm font-medium text-foreground">
                      {larguraNum > 0 ? `${larguraNum} CM` : "—"}
                    </div>
                  </div>
                  <div
                    className="flex items-center text-sm font-medium text-foreground shrink-0"
                    style={{ height: previewArt.h }}
                  >
                    {alturaNum > 0 ? `${alturaNum} CM` : "—"}
                  </div>
                </div>
              </div>

            </Card>
          )}

          {active === "paspatur" && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold">Paspatur</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Defina as margens do paspatur. As medidas finais serão utilizadas pelos
                próximos campos do orçamento.
              </p>

              {(alturaNum <= 0 || larguraNum <= 0) && (
                <p className="mt-4 text-xs text-amber-600">
                  Informe altura e largura na etapa Tamanho antes de configurar o
                  paspatur.
                </p>
              )}

              <div className="mt-6 max-w-md space-y-1.5">
                <Label htmlFor="paspatur-ativo">Paspatur</Label>
                <Select
                  value={paspaturAtivo}
                  onValueChange={(v) => setPaspaturAtivo(v as "sim" | "nao")}
                >
                  <SelectTrigger id="paspatur-ativo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paspaturAtivo === "sim" && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 max-w-2xl">
                    <FieldNum label="Esquerda (cm)" id="m-esq" value={margemEsq} onChange={setMargemEsq} />
                    <FieldNum label="Direita (cm)" id="m-dir" value={margemDir} onChange={setMargemDir} />
                    <FieldNum label="Superior (cm)" id="m-sup" value={margemSup} onChange={setMargemSup} />
                    <FieldNum label="Inferior (cm)" id="m-inf" value={margemInf} onChange={setMargemInf} />
                  </div>

                  <div className="mt-6 max-w-md space-y-1.5">
                    <Label htmlFor="paspatur">Produto Paspatur</Label>
                    <ProductSelect
                      id="paspatur"
                      value={paspaturId}
                      onChange={setPaspaturId}
                      products={paspaturs}
                      loading={loadingPaspaturs}
                      placeholder="Selecione um paspatur"
                      emptyLabel="Nenhum paspatur cadastrado."
                    />
                  </div>

                  <div className="mt-6 max-w-md space-y-1.5">
                    <Label htmlFor="paspatur-adic-ativo">Incluir paspatur adicional</Label>
                    <Select
                      value={paspaturAdicionalAtivo}
                      onValueChange={(v) =>
                        setPaspaturAdicionalAtivo(v as "sim" | "nao")
                      }
                    >
                      <SelectTrigger id="paspatur-adic-ativo">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nao">Não</SelectItem>
                        <SelectItem value="sim">Sim</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {paspaturAdicionalAtivo === "sim" && (
                    <div className="mt-6 rounded-md border border-border bg-muted/20 p-4 space-y-4 max-w-2xl">
                      <div className="space-y-1.5">
                        <Label htmlFor="paspatur-adic-obs">
                          Observação do paspatur adicional
                        </Label>
                        <Textarea
                          id="paspatur-adic-obs"
                          rows={2}
                          value={paspaturAdicionalObs}
                          onChange={(e) => setPaspaturAdicionalObs(e.target.value)}
                          placeholder="Ex: deixar apenas um filete aparente"
                        />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <FieldNum
                          label="Esquerda (cm)"
                          id="m-adic-esq"
                          value={paspaturAdicionalEsq}
                          onChange={setPaspaturAdicionalEsq}
                        />
                        <FieldNum
                          label="Direita (cm)"
                          id="m-adic-dir"
                          value={paspaturAdicionalDir}
                          onChange={setPaspaturAdicionalDir}
                        />
                        <FieldNum
                          label="Superior (cm)"
                          id="m-adic-sup"
                          value={paspaturAdicionalSup}
                          onChange={setPaspaturAdicionalSup}
                        />
                        <FieldNum
                          label="Inferior (cm)"
                          id="m-adic-inf"
                          value={paspaturAdicionalInf}
                          onChange={setPaspaturAdicionalInf}
                        />
                      </div>

                      <div className="max-w-md space-y-1.5">
                        <Label htmlFor="paspatur-adic">Produto Paspatur adicional</Label>
                        <ProductSelect
                          id="paspatur-adic"
                          value={paspaturAdicionalId}
                          onChange={setPaspaturAdicionalId}
                          products={paspaturs}
                          loading={loadingPaspaturs}
                          placeholder="Selecione um paspatur"
                          emptyLabel="Nenhum paspatur cadastrado."
                        />
                      </div>

                      {paspaturAdicionalInvalido && (
                        <p className="text-xs text-destructive">
                          O paspatur adicional não pode ter margem maior que o paspatur
                          principal.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {alturaNum > 0 && larguraNum > 0 && (
                <div ref={previewPaspaturRef} className="mt-10 w-full overflow-hidden flex justify-center">
                  <div className="inline-flex items-start gap-4 max-w-full">
                    <div className="flex flex-col items-center min-w-0">
                      <div
                        className="relative border-2 border-foreground/70 rounded-sm bg-muted/50 transition-all max-w-full"
                        style={{
                          width: previewPaspatur.outerW,
                          height: previewPaspatur.outerH,
                          paddingLeft: previewPaspatur.padLeft,
                          paddingRight: previewPaspatur.padRight,
                          paddingTop: previewPaspatur.padTop,
                          paddingBottom: previewPaspatur.padBottom,
                        }}
                      >
                        {previewPaspatur.adicionalOn ? (
                          <div
                            className="relative w-full h-full border-2 border-foreground/50 bg-muted/30"
                            style={{
                              paddingLeft: previewPaspatur.adPadLeft,
                              paddingRight: previewPaspatur.adPadRight,
                              paddingTop: previewPaspatur.adPadTop,
                              paddingBottom: previewPaspatur.adPadBottom,
                            }}
                          >
                            <div className="w-full h-full border-2 border-foreground/70 bg-background flex items-center justify-center">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                Arte {larguraNum}×{alturaNum}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-full border-2 border-foreground/70 bg-background flex items-center justify-center">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Arte {larguraNum}×{alturaNum}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 text-sm font-medium text-foreground">
                        {larguraFinal} CM
                      </div>
                    </div>
                    <div
                      className="flex items-center text-sm font-medium text-foreground shrink-0"
                      style={{ height: previewPaspatur.outerH }}
                    >
                      {alturaFinal} CM
                    </div>
                  </div>
                </div>

              )}

              {paspaturAtivo === "sim" && (valorPaspaturPrincipal > 0 || valorPaspaturAdicional > 0) && (
                <div className="mt-6 max-w-2xl rounded-md border border-border bg-muted/30 p-4 text-sm space-y-1.5">
                  {paspaturAdicionalAtivo === "sim" ? (
                    <>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">
                          Paspatur externo
                          {paspaturSelecionado ? ` (${paspaturSelecionado.code})` : ""}
                          <span className="block text-xs">Medida usada: {larguraFinal} × {alturaFinal} cm</span>
                        </span>
                        <span className="font-medium text-foreground whitespace-nowrap">
                          {fmtMoney(valorPaspaturPrincipal)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">
                          Paspatur interno
                          {paspaturAdicionalSelecionado ? ` (${paspaturAdicionalSelecionado.code})` : ""}
                          <span className="block text-xs">Medida usada: {larguraAdicional} × {alturaAdicional} cm</span>
                        </span>
                        <span className="font-medium text-foreground whitespace-nowrap">
                          {fmtMoney(valorPaspaturAdicional)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 border-t border-border pt-1.5 mt-1">
                        <span className="font-semibold text-foreground">Total paspatur</span>
                        <span className="font-semibold text-foreground">{fmtMoney(valorPaspatur)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        Paspatur
                        {paspaturSelecionado ? ` (${paspaturSelecionado.code})` : ""}
                        <span className="block text-xs">Medida usada: {larguraFinal} × {alturaFinal} cm</span>
                      </span>
                      <span className="font-semibold text-foreground whitespace-nowrap">
                        {fmtMoney(valorPaspaturPrincipal)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}



          {active === "perfil" && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold">Qual perfil será utilizado?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                O cálculo usa as medidas finais (com paspatur quando aplicado).
              </p>

              <div className="mt-6 max-w-md space-y-1.5">
                <Label htmlFor="perfil">Código</Label>
                <ProductSelect
                  id="perfil"
                  value={perfilId}
                  onChange={setPerfilId}
                  products={perfis}
                  loading={loadingPerfis}
                  placeholder="Selecione um perfil"
                  emptyLabel="Nenhum perfil cadastrado."
                />
              </div>

              <div className="mt-6 max-w-md space-y-1.5">
                <Label htmlFor="perfil-adicional-ativo">Adicionar perfil adicional?</Label>
                <Select
                  value={perfilAdicionalAtivo}
                  onValueChange={(v) => setPerfilAdicionalAtivo(v as "sim" | "nao")}
                >
                  <SelectTrigger id="perfil-adicional-ativo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {perfilAdicionalAtivo === "sim" && (
                <div className="mt-4 max-w-md space-y-1.5">
                  <Label htmlFor="perfil-adicional">Perfil adicional</Label>
                  <ProductSelect
                    id="perfil-adicional"
                    value={perfilAdicionalId}
                    onChange={setPerfilAdicionalId}
                    products={perfis}
                    loading={loadingPerfis}
                    placeholder="Selecione um perfil"
                    emptyLabel="Nenhum perfil cadastrado."
                  />
                  {perfilAdicionalAtivo === "sim" && !perfilSelecionado && (
                    <p className="mt-2 text-xs text-amber-600">
                      Selecione o perfil principal para calcular o perfil adicional.
                    </p>
                  )}
                </div>
              )}

              {perfilSelecionado && valorPerfilPrincipal > 0 && (
                <div className="mt-6 max-w-2xl rounded-md border border-border bg-muted/30 p-4 text-sm space-y-1.5">
                  {perfilAdicionalAtivo === "sim" && perfilAdicionalSelecionado ? (
                    <>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">
                          Perfil externo ({perfilAdicionalSelecionado.code})
                          <span className="block text-xs">Medida usada: {larguraPerfilAdicional} × {alturaPerfilAdicional} cm</span>
                        </span>
                        <span className="font-medium text-foreground whitespace-nowrap">
                          {fmtMoney(valorPerfilAdicional)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">
                          Perfil interno ({perfilSelecionado.code})
                          <span className="block text-xs">Medida usada: {larguraFinal} × {alturaFinal} cm</span>
                        </span>
                        <span className="font-medium text-foreground whitespace-nowrap">
                          {fmtMoney(valorPerfilPrincipal)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 border-t border-border pt-1.5 mt-1">
                        <span className="font-semibold text-foreground">Total perfil</span>
                        <span className="font-semibold text-foreground">{fmtMoney(valorPerfil)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        Perfil ({perfilSelecionado.code})
                        <span className="block text-xs">Medida usada: {larguraFinal} × {alturaFinal} cm</span>
                      </span>
                      <span className="font-semibold text-foreground whitespace-nowrap">
                        {fmtMoney(valorPerfilPrincipal)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {(alturaFinal <= 0 || larguraFinal <= 0) && (
                <p className="mt-4 text-xs text-amber-600">
                  Informe altura e largura na etapa Tamanho para calcular o valor.
                </p>
              )}
            </Card>
          )}

          {active === "vidro" && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold">Vidro / Espelho</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Informe se o pedido terá vidro ou espelho
              </p>

              <div className="mt-6 max-w-md space-y-1.5">
                <Label htmlFor="vidro-tipo">Vidro</Label>
                <Select
                  value={vidroTipo}
                  onValueChange={(v) => setVidroTipo(v as "sim" | "nao")}
                >
                  <SelectTrigger id="vidro-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {vidroTipo === "sim" && (
                <>
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                    <div className="space-y-1.5">
                      <Label htmlFor="vidro">Espessura do Vidro</Label>
                      <ProductSelect
                        id="vidro"
                        value={vidroId}
                        onChange={setVidroId}
                        products={vidros}
                        loading={loadingVidros}
                        placeholder="Selecione um vidro"
                        emptyLabel="Nenhum vidro cadastrado."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="vidro-qtd">Quantidade</Label>
                      <Input
                        id="vidro-qtd"
                        type="number"
                        min={1}
                        step={1}
                        value={vidroQuantidade}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            setVidroQuantidade("");
                            return;
                          }
                          const n = Math.max(1, Math.floor(Number(raw) || 1));
                          setVidroQuantidade(String(n));
                        }}
                        onBlur={() => {
                          if (!vidroQuantidade || Number(vidroQuantidade) < 1) {
                            setVidroQuantidade("1");
                          }
                        }}
                      />
                    </div>
                  </div>

                  {vidroSelecionado && valorVidroUnit > 0 && (
                    <div className="mt-6 max-w-md rounded-md border border-border bg-muted/30 p-4 text-sm space-y-1">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">
                          Vidro ({vidroSelecionado.code})
                          <span className="block text-xs">Medida usada: {larguraFinal} × {alturaFinal} cm</span>
                        </span>
                        <span className="font-medium text-foreground whitespace-nowrap">
                          {fmtMoney(valorVidroUnit)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Quantidade</span>
                        <span className="font-medium text-foreground">{vidroQuantidadeNum}</span>
                      </div>
                      <div className="flex justify-between gap-3 border-t border-border pt-1.5 mt-1">
                        <span className="font-semibold text-foreground">Total vidro</span>
                        <span className="font-semibold text-foreground">{fmtMoney(valorVidro)}</span>
                      </div>
                    </div>
                  )}
                </>
              )}

            </Card>
          )}

          {active === "foam" && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold">Foam / MDF</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Selecione o produto de Foam ou MDF utilizado
              </p>

              <div className="mt-6 max-w-md space-y-1.5">
                <Label htmlFor="foam">Produto</Label>
                <ProductSelect
                  id="foam"
                  value={foamId}
                  onChange={setFoamId}
                  products={foams}
                  loading={loadingFoams}
                  placeholder="Selecione um produto"
                  emptyLabel="Nenhum produto cadastrado."
                />
              </div>

            </Card>
          )}

          {active === "colagem" && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold">Colagem</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Informe se o orçamento incluirá colagem.
              </p>

              <div className="mt-6 max-w-md space-y-1.5">
                <Label htmlFor="colagem-ativo">Colagem</Label>
                <Select
                  value={colagemAtivo}
                  onValueChange={(v) => setColagemAtivo(v as "sim" | "nao")}
                >
                  <SelectTrigger id="colagem-ativo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {colagemAtivo === "sim" && (
                <div className="mt-6 max-w-md space-y-1.5">
                  <Label htmlFor="colagem">Produto de colagem</Label>
                  <ProductSelect
                    id="colagem"
                    value={colagemId}
                    onChange={setColagemId}
                    products={colagens}
                    loading={loadingColagens}
                    placeholder="Selecione um produto"
                    emptyLabel="Nenhum produto de colagem cadastrado."
                  />
                </div>
              )}

            </Card>
          )}

          {active === "impressao" && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold">Impressão</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Configure a impressão e envie o arquivo.
              </p>

              <div className="mt-6 max-w-md space-y-1.5">
                <Label htmlFor="impressao-ativo">Impressão</Label>
                <Select
                  value={impressaoAtivo}
                  onValueChange={(v) => setImpressaoAtivo(v as "sim" | "nao")}
                >
                  <SelectTrigger id="impressao-ativo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {impressaoAtivo === "sim" && (
                <>
                  <div className="mt-6 max-w-md space-y-1.5">
                    <Label htmlFor="impressao">Tipo de impressão</Label>
                    <ProductSelect
                      id="impressao"
                      value={impressaoId}
                      onChange={setImpressaoId}
                      products={impressoes}
                      loading={loadingImpressoes}
                      placeholder="Selecione um tipo"
                      emptyLabel="Nenhum tipo de impressão cadastrado."
                    />
                  </div>

                  <div className="mt-6 max-w-md">
                    <Label>Arquivo da impressão</Label>
                    <label
                      htmlFor="impressao-arquivo"
                      className="mt-1.5 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-input rounded-md px-6 py-8 text-center cursor-pointer hover:bg-accent/40 transition-colors"
                    >
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">
                        {impressaoArquivo ? impressaoArquivo.name : "Escolher arquivo"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Formatos aceitos: PDF, JPEG e PNG
                      </span>
                      <input
                        id="impressao-arquivo"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        className="hidden"
                        onChange={(e) =>
                          setImpressaoArquivo(e.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                  </div>

                </>
              )}
            </Card>
          )}

          {active === "diversos" && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold">Produtos Diversos</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Adicione produtos diversos vinculados a este item. Eles somam ao subtotal do item.
              </p>

              <div className="mt-6 space-y-4">
                {produtosDiversos.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum produto diverso adicionado.
                  </p>
                )}

                {produtosDiversos.map((di, idx) => (
                  <div
                    key={di.uid}
                    className="rounded-md border border-border bg-muted/20 p-4 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-3 items-end">
                      <div className="space-y-1.5 min-w-0">
                        <Label>Produto</Label>
                        <ProductSelect
                          id={`diverso-${di.uid}`}
                          value={di.productId}
                          onChange={(pid) => {
                            const prod = diversosProdutos.find((p) => p.id === pid);
                            setProdutosDiversos((prev) =>
                              prev.map((it, i) =>
                                i === idx
                                  ? {
                                      ...it,
                                      productId: pid,
                                      code: prod?.code ?? "",
                                      nome: prod?.description ?? "",
                                      valorUnitario: Number(prod?.value_per_meter ?? 0),
                                    }
                                  : it,
                              ),
                            );
                          }}
                          products={diversosProdutos}
                          loading={loadingDiversos}
                          placeholder="Selecione um produto"
                          emptyLabel="Nenhum produto diverso cadastrado."
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`qtd-${di.uid}`}>Quantidade</Label>
                        <Input
                          id={`qtd-${di.uid}`}
                          type="number"
                          min={1}
                          step={1}
                          value={String(di.quantidade)}
                          onChange={(e) => {
                            const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                            setProdutosDiversos((prev) =>
                              prev.map((it, i) =>
                                i === idx ? { ...it, quantidade: n } : it,
                              ),
                            );
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          setProdutosDiversos((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label="Remover produto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {di.productId && (
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4">
                        <span>Valor unitário: <span className="font-medium text-foreground">{fmtMoney(di.valorUnitario)}</span></span>
                        <span>Total: <span className="font-medium text-foreground">{fmtMoney(di.valorUnitario * di.quantidade)}</span></span>
                      </div>
                    )}
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setProdutosDiversos((prev) => [
                      ...prev,
                      {
                        uid: `d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                        productId: "",
                        code: "",
                        nome: "",
                        valorUnitario: 0,
                        quantidade: 1,
                      },
                    ])
                  }
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Adicionar produto diverso
                </Button>

                {diversosItens.length > 0 && (
                  <div className="rounded-md border border-border bg-muted/30 p-4 text-sm space-y-1 max-w-md">
                    {diversosItens.map((di) => (
                      <div key={di.uid} className="flex justify-between gap-3">
                        <span className="text-muted-foreground truncate">
                          {di.code ? `${di.code} ` : ""}{di.nome || "Produto"} · {di.quantidade}× {fmtMoney(di.valorUnitario)}
                        </span>
                        <span className="font-medium text-foreground whitespace-nowrap">
                          {fmtMoney(di.total)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between gap-3 border-t border-border pt-1.5 mt-1">
                      <span className="font-semibold text-foreground">Total Produtos Diversos</span>
                      <span className="font-semibold text-foreground">{fmtMoney(valorDiversos)}</span>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {active === "instalacao" && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold">Instalação / Frete</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Defina valores manuais de instalação e entrega. Estes valores são gerais
                do orçamento e somam ao total final.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6 max-w-2xl">
                <div className="space-y-1.5">
                  <Label htmlFor="inst-ativo">Necessita de instalação?</Label>
                  <Select
                    value={instalacaoAtivo}
                    onValueChange={(v) => setInstalacaoAtivo(v as "sim" | "nao")}
                  >
                    <SelectTrigger id="inst-ativo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao">Não</SelectItem>
                      <SelectItem value="sim">Sim</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {instalacaoAtivo === "sim" && (
                  <FieldNum
                    id="valor-inst"
                    label="Valor da instalação (R$)"
                    value={valorInstalacaoStr}
                    onChange={setValorInstalacaoStr}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6 max-w-2xl">
                <div className="space-y-1.5">
                  <Label htmlFor="tipo-entrega">Tipo de entrega</Label>
                  <Select
                    value={tipoEntrega}
                    onValueChange={(v) => setTipoEntrega(v as TipoEntrega)}
                  >
                    <SelectTrigger id="tipo-entrega">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Retirada">Retirada</SelectItem>
                      <SelectItem value="Motoboy">Motoboy</SelectItem>
                      <SelectItem value="Sedex">Sedex</SelectItem>
                      <SelectItem value="Transportadora">Transportadora</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {tipoEntrega !== "Retirada" && (
                  <FieldNum
                    id="valor-entrega"
                    label="Valor da entrega (R$)"
                    value={valorEntregaStr}
                    onChange={setValorEntregaStr}
                  />
                )}
              </div>

              <div className="mt-6 rounded-md border border-border bg-muted/30 p-4 max-w-md text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Instalação:</span>
                  <span className="font-semibold">{fmtMoney(valorInstalacao)}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Entrega:</span>
                  <span className="font-semibold">{fmtMoney(valorEntrega)}</span>
                </div>
              </div>
            </Card>
          )}

          {active === "finalizacao" && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold">Finalização</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Revise o resumo e finalize o orçamento.
              </p>

              <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Resumo */}
                <div className="rounded-md border border-border bg-muted/30 p-5 space-y-2 text-sm">
                  <h3 className="font-semibold text-base text-foreground mb-2">
                    Resumo do orçamento
                  </h3>

                  {/* Itens chips */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {items.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => selectItem(i)}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                          i === activeIndex
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background hover:bg-accent",
                        )}
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        Item {i + 1}
                        <span className="text-muted-foreground font-normal">
                          {fmtMoney(itemSubtotals[i] ?? 0)}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Item {activeIndex + 1}
                  </div>
                  <Row
                    label="Tamanho original"
                    value={`${larguraNum || 0} × ${alturaNum || 0} cm`}
                  />
                  <Row
                    label="Tamanho final (com paspatur)"
                    value={`${larguraFinal || 0} × ${alturaFinal || 0} cm`}
                  />
                  <hr className="my-2 border-border" />
                  {paspaturAdicionalAtivo === "sim" && paspaturAtivo === "sim" ? (
                    <>
                      <Row
                        label={`Paspatur principal${paspaturSelecionado ? ` (${paspaturSelecionado.code})` : ""}`}
                        value={fmtMoney(valorPaspaturPrincipal)}
                      />
                      <div className="text-xs text-muted-foreground pl-2">
                        Margens: E {mEsq} · D {mDir} · S {mSup} · I {mInf} cm
                      </div>
                      <Row
                        label={`Paspatur adicional${paspaturAdicionalSelecionado ? ` (${paspaturAdicionalSelecionado.code})` : ""}`}
                        value={fmtMoney(valorPaspaturAdicional)}
                      />
                      <div className="text-xs text-muted-foreground pl-2">
                        Margens: E {mEsqA} · D {mDirA} · S {mSupA} · I {mInfA} cm
                        {paspaturAdicionalObs ? ` · ${paspaturAdicionalObs}` : ""}
                      </div>
                      <Row
                        label="Total Paspatur"
                        value={fmtMoney(valorPaspatur)}
                      />
                    </>
                  ) : (
                    <Row
                      label={`Paspatur${paspaturSelecionado ? ` (${paspaturSelecionado.code})` : ""}`}
                      value={fmtMoney(valorPaspatur)}
                    />
                  )}
                  {perfilAdicionalAtivo === "sim" && perfilAdicionalSelecionado ? (
                    <>
                      <Row
                        label={`Perfil principal${perfilSelecionado ? ` (${perfilSelecionado.code})` : ""}`}
                        value={fmtMoney(valorPerfilPrincipal)}
                      />
                      <Row
                        label={`Perfil adicional${perfilAdicionalSelecionado ? ` (${perfilAdicionalSelecionado.code})` : ""}`}
                        value={fmtMoney(valorPerfilAdicional)}
                      />
                      <div className="text-xs text-muted-foreground pl-2">
                        Medida usada no cálculo: {larguraPerfilAdicional} × {alturaPerfilAdicional} cm
                      </div>
                      <Row label="Total Perfil" value={fmtMoney(valorPerfil)} />
                    </>
                  ) : (
                    <Row
                      label={`Perfil${perfilSelecionado ? ` (${perfilSelecionado.code})` : ""}`}
                      value={fmtMoney(valorPerfil)}
                    />
                  )}
                  <Row
                    label={`Vidro${vidroSelecionado && vidroTipo === "sim" ? ` (${vidroSelecionado.code})` : ""}`}
                    value={fmtMoney(valorVidro)}
                  />
                  {vidroTipo === "sim" && vidroSelecionado && vidroQuantidadeNum > 1 && (
                    <div className="text-xs text-muted-foreground pl-2">
                      {vidroQuantidadeNum}× {fmtMoney(valorVidroUnit)}
                    </div>
                  )}
                  <Row
                    label={`Foam/MDF${foamSelecionado ? ` (${foamSelecionado.code})` : ""}`}
                    value={fmtMoney(valorFoam)}
                  />
                  <Row
                    label={`Colagem${colagemSelecionada && colagemAtivo === "sim" ? ` (${colagemSelecionada.code})` : ""}`}
                    value={fmtMoney(valorColagem)}
                  />
                  <Row
                    label={`Impressão${impressaoSelecionada && impressaoAtivo === "sim" ? ` (${impressaoSelecionada.code})` : ""}`}
                    value={fmtMoney(valorImpressao)}
                  />
                  {diversosItens.length > 0 && (
                    <>
                      {diversosItens.map((di) => (
                        <div key={di.uid}>
                          <Row
                            label={`${di.code ? `${di.code} · ` : ""}${di.nome || "Produto diverso"}`}
                            value={fmtMoney(di.total)}
                          />
                          <div className="text-xs text-muted-foreground pl-2">
                            {di.quantidade}× {fmtMoney(di.valorUnitario)}
                          </div>
                        </div>
                      ))}
                      <Row
                        label="Total Produtos Diversos"
                        value={fmtMoney(valorDiversos)}
                      />
                    </>
                  )}
                  <Row
                    label={`Subtotal Item ${activeIndex + 1}`}
                    value={fmtMoney(activeValues.subtotal)}
                  />

                  {/* Other items */}
                  {items.length > 1 && (
                    <>
                      <hr className="my-2 border-border" />
                      {items.map((_, i) =>
                        i === activeIndex ? null : (
                          <Row
                            key={i}
                            label={`Item ${i + 1}`}
                            value={fmtMoney(itemSubtotals[i] ?? 0)}
                          />
                        ),
                      )}
                    </>
                  )}

                  <hr className="my-2 border-border" />
                  <Row label="Instalação" value={fmtMoney(valorInstalacao)} />
                  <Row label={`Entrega (${tipoEntrega})`} value={fmtMoney(valorEntrega)} />
                  <Row label="Mão de obra extra" value={fmtMoney(maoDeObraExtra)} />
                  <hr className="my-2 border-border" />
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-semibold text-foreground">Total geral</span>
                    <span className="text-xl font-bold bg-gradient-brand bg-clip-text text-transparent">
                      {fmtMoney(valorTotal)}
                    </span>
                  </div>
                </div>

                {/* Campos finais */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cliente">Cliente</Label>
                    <Input
                      id="cliente"
                      placeholder="Nome do cliente"
                      value={clienteNome}
                      onChange={(e) => setClienteNome(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="forma-pagto">Forma de pagamento</Label>
                    <Select
                      value={formaPagamento}
                      onValueChange={(v) => setFormaPagamento(v as FormaPagto)}
                    >
                      <SelectTrigger id="forma-pagto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="Pix">Pix</SelectItem>
                        <SelectItem value="Cartão de crédito">Cartão de crédito</SelectItem>
                        <SelectItem value="Cartão de débito">Cartão de débito</SelectItem>
                        <SelectItem value="Boleto">Boleto</SelectItem>
                        <SelectItem value="A combinar">A combinar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FieldNum
                      id="mao-obra"
                      label="Mão de obra extra (R$)"
                      value={maoDeObraExtraStr}
                      onChange={setMaoDeObraExtraStr}
                    />
                    <div className="space-y-1.5">
                      <Label htmlFor="venc">Data de vencimento</Label>
                      <Input
                        id="venc"
                        type="date"
                        value={dataVencimento}
                        onChange={(e) => setDataVencimento(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="obs">Observações</Label>
                    <Textarea
                      id="obs"
                      rows={4}
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      placeholder="Observações adicionais"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-wrap sm:flex-row gap-3 pt-2">
                    <Button
                      type="button"
                      onClick={handleSalvar}
                      disabled={salvando}
                      className="w-full sm:w-auto bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
                    >
                      {salvando
                        ? "Salvando..."
                        : isEdit
                          ? "Atualizar Orçamento"
                          : "Salvar Orçamento"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addNewItem}
                      className="w-full sm:w-auto"
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      Orçar mais um produto
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCloneOpen(true)}
                      className="w-full sm:w-auto"
                    >
                      <Copy className="h-4 w-4 mr-1.5" />
                      Clonar produto
                    </Button>

                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair do orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao sair, você perderá as alterações não salvas deste orçamento. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowExitDialog(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => navigate({ to: "/orcamentos" })}
            >
              Sair do orçamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteIndex !== null}
        onOpenChange={(o) => !o && setDeleteIndex(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente excluir este item do orçamento?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteIndex !== null) deleteItem(deleteIndex);
                setDeleteIndex(null);
              }}
            >
              Excluir item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clonar produto</DialogTitle>
            <DialogDescription>
              Selecione um item para clonar. Um novo item idêntico será adicionado ao
              final da lista.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2 max-h-[60vh] overflow-y-auto">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  cloneItem(i);
                  setCloneOpen(false);
                }}
                className="w-full flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
              >
                <span className="font-medium">Item {i + 1}</span>
                <span className="text-muted-foreground">
                  {fmtMoney(itemSubtotals[i] ?? 0)}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>

  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-right">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-base font-semibold">{fmtMoney(value)}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function FieldNum({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ProductSelect({
  id,
  value,
  onChange,
  products,
  loading,
  placeholder,
  emptyLabel,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  products: Produto[];
  loading: boolean;
  placeholder: string;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p.id === value);
  const label = (p: Produto) => `${p.code}${p.description ? ` — ${p.description}` : ""}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={loading}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {loading
              ? "Carregando..."
              : selected
                ? label(selected)
                : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command
          filter={(val, search) => {
            if (!search) return 1;
            return val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Digite código ou descrição..." />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {products.map((p) => (
                <CommandItem
                  key={p.id}
                  value={label(p)}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === p.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{label(p)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

