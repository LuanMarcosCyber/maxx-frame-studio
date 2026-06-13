import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
          "id, code, description, value_per_meter, profit_margin, waste_percentage, category",
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
type ItemSnapshot = {
  altura: string;
  largura: string;
  paspaturAtivo: "sim" | "nao";
  margemEsq: string;
  margemDir: string;
  margemSup: string;
  margemInf: string;
  paspaturId: string;
  perfilId: string;
  vidroTipo: "sim" | "nao";
  vidroId: string;
  foamId: string;
  colagemAtivo: "sim" | "nao";
  colagemId: string;
  impressaoAtivo: "sim" | "nao";
  impressaoId: string;
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
  perfilId: "",
  vidroTipo: "nao",
  vidroId: "",
  foamId: "",
  colagemAtivo: "nao",
  colagemId: "",
  impressaoAtivo: "nao",
  impressaoId: "",
};

type ItemValues = ReturnType<typeof computeItemValues>;

function computeItemValues(
  snap: ItemSnapshot,
  P: {
    paspatur: Produto | null;
    perfil: Produto | null;
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

  let valorPaspatur = 0;
  if (snap.paspaturAtivo === "sim" && P.paspatur && larguraFinal > 0 && alturaFinal > 0) {
    const area = (larguraFinal * alturaFinal) / 10000;
    const base = area * Number(P.paspatur.value_per_meter);
    const cp = base * (1 + Number(P.paspatur.waste_percentage) / 100);
    valorPaspatur = cp * (1 + Number(P.paspatur.profit_margin) / 100);
  }

  let valorPerfil = 0;
  if (P.perfil && alturaFinal > 0 && larguraFinal > 0) {
    const perim = ((alturaFinal + larguraFinal) * 2) / 100;
    const base = perim * Number(P.perfil.value_per_meter);
    const cp = base * (1 + Number(P.perfil.waste_percentage) / 100);
    valorPerfil = cp * (1 + Number(P.perfil.profit_margin) / 100);
  }

  const valorVidro =
    snap.vidroTipo === "sim" ? calcAreaValue(P.vidro, alturaFinal, larguraFinal) : 0;
  const valorFoam = calcAreaValue(P.foam, alturaFinal, larguraFinal);
  const valorColagem =
    snap.colagemAtivo === "sim"
      ? calcAreaValue(P.colagem, alturaFinal, larguraFinal)
      : 0;
  const valorImpressao =
    snap.impressaoAtivo === "sim"
      ? calcAreaValue(P.impressao, alturaFinal, larguraFinal)
      : 0;

  const subtotal =
    valorPaspatur + valorPerfil + valorVidro + valorFoam + valorColagem + valorImpressao;

  return {
    alturaNum,
    larguraNum,
    mEsq,
    mDir,
    mSup,
    mInf,
    alturaFinal,
    larguraFinal,
    valorPaspatur,
    valorPerfil,
    valorVidro,
    valorFoam,
    valorColagem,
    valorImpressao,
    subtotal,
  };
}

function buildItemDetails(
  snap: ItemSnapshot,
  v: ItemValues,
  P: {
    paspatur: Produto | null;
    perfil: Produto | null;
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
    margemEsq: snap.margemEsq,
    margemDir: snap.margemDir,
    margemSup: snap.margemSup,
    margemInf: snap.margemInf,
    perfilId: snap.perfilId,
    perfilCode: P.perfil?.code ?? null,
    perfilDescription: P.perfil?.description ?? null,
    valorPerfil: Number(v.valorPerfil.toFixed(2)),
    vidroTipo: snap.vidroTipo,
    vidroId: snap.vidroId,
    vidroCode: P.vidro?.code ?? null,
    vidroDescription: P.vidro?.description ?? null,
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
    subtotal: Number(v.subtotal.toFixed(2)),
  };
}

// Hydrate an ItemSnapshot from a saved details jsonb (used for legacy details and budget_items.data)
function snapshotFromDetails(d: Record<string, unknown>): ItemSnapshot {
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  return {
    altura: s("altura"),
    largura: s("largura"),
    paspaturAtivo: d.paspaturAtivo === "sim" ? "sim" : "nao",
    margemEsq: s("margemEsq"),
    margemDir: s("margemDir"),
    margemSup: s("margemSup"),
    margemInf: s("margemInf"),
    paspaturId: s("paspaturId"),
    perfilId: s("perfilId"),
    vidroTipo: d.vidroTipo === "sim" ? "sim" : "nao",
    vidroId: s("vidroId"),
    foamId: s("foamId"),
    colagemAtivo: d.colagemAtivo === "sim" ? "sim" : "nao",
    colagemId: s("colagemId"),
    impressaoAtivo: d.impressaoAtivo === "sim" ? "sim" : "nao",
    impressaoId: s("impressaoId"),
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
  const [perfilId, setPerfilId] = useState<string>("");
  const [vidroTipo, setVidroTipo] = useState<"sim" | "nao">("nao");
  const [vidroId, setVidroId] = useState<string>("");
  const [foamId, setFoamId] = useState<string>("");
  const [colagemAtivo, setColagemAtivo] = useState<"sim" | "nao">("nao");
  const [colagemId, setColagemId] = useState<string>("");
  const [impressaoAtivo, setImpressaoAtivo] = useState<"sim" | "nao">("nao");
  const [impressaoId, setImpressaoId] = useState<string>("");
  const [impressaoArquivo, setImpressaoArquivo] = useState<File | null>(null);

  // Budget-level (geral)
  const [instalacaoAtivo, setInstalacaoAtivo] = useState<"sim" | "nao">("nao");
  const [valorInstalacaoStr, setValorInstalacaoStr] = useState<string>("");
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>("Retirada");
  const [valorEntregaStr, setValorEntregaStr] = useState<string>("");
  const [clienteNome, setClienteNome] = useState<string>("");
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

  // Resolve products for an arbitrary snapshot (used for non-active items)
  function resolveProducts(snap: ItemSnapshot) {
    return {
      paspatur: paspaturs.find((p) => p.id === snap.paspaturId) ?? null,
      perfil: perfis.find((p) => p.id === snap.perfilId) ?? null,
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
      perfilId,
      vidroTipo,
      vidroId,
      foamId,
      colagemAtivo,
      colagemId,
      impressaoAtivo,
      impressaoId,
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
      perfilId,
      vidroTipo,
      vidroId,
      foamId,
      colagemAtivo,
      colagemId,
      impressaoAtivo,
      impressaoId,
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
    alturaFinal,
    larguraFinal,
    valorPaspatur,
    valorPerfil,
    valorVidro,
    valorFoam,
    valorColagem,
    valorImpressao,
  } = activeValues;

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

  // Preview Tamanho
  const previewArt = useMemo(() => {
    const maxW = 320;
    const maxH = 240;
    const a = alturaNum > 0 ? alturaNum : 0;
    const l = larguraNum > 0 ? larguraNum : 0;
    if (a === 0 && l === 0) return { w: 200, h: 150, empty: true };
    const scale = Math.min(maxW / (l || 1), maxH / (a || 1));
    return {
      w: Math.max(40, Math.round((l || 1) * scale)),
      h: Math.max(40, Math.round((a || 1) * scale)),
      empty: false,
    };
  }, [alturaNum, larguraNum]);

  const previewPaspatur = useMemo(() => {
    const maxW = 360;
    const maxH = 280;
    const lf = larguraFinal > 0 ? larguraFinal : Math.max(larguraNum, 1);
    const af = alturaFinal > 0 ? alturaFinal : Math.max(alturaNum, 1);
    const scale = Math.min(maxW / lf, maxH / af);
    return {
      outerW: Math.max(60, Math.round(lf * scale)),
      outerH: Math.max(60, Math.round(af * scale)),
      padLeft: Math.round(mEsq * scale),
      padRight: Math.round(mDir * scale),
      padTop: Math.round(mSup * scale),
      padBottom: Math.round(mInf * scale),
      scale,
    };
  }, [larguraFinal, alturaFinal, larguraNum, alturaNum, mEsq, mDir, mSup, mInf]);

  // Selected products (active item) for "selected info" cards
  const perfilSelecionado = activeProducts.perfil;
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
    setPerfilId(s.perfilId);
    setVidroTipo(s.vidroTipo);
    setVidroId(s.vidroId);
    setFoamId(s.foamId);
    setColagemAtivo(s.colagemAtivo);
    setColagemId(s.colagemId);
    setImpressaoAtivo(s.impressaoAtivo);
    setImpressaoId(s.impressaoId);
    setImpressaoArquivo(null);
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

  async function handleSalvar() {
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

    setSalvando(true);
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
        total_value: Number(valorTotal.toFixed(2)),
        data_vencimento: dataVencimento || null,
        details: generalDetails as never,
      };

      let budgetId: string;
      if (isEdit && editId) {
        const { error } = await supabase
          .from("budgets")
          .update(budgetPayload)
          .eq("id", editId);
        if (error) throw error;
        budgetId = editId;
      } else {
        const number = `ORC-${Date.now().toString().slice(-8)}`;
        const { data: inserted, error } = await supabase
          .from("budgets")
          .insert({
            user_id: ownerUserId ?? session.user.id,
            number,
            status: "Pendente",
            ...budgetPayload,
          })
          .select("id")
          .single();
        if (error) throw error;
        budgetId = inserted.id;
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

      toast.success(
        isEdit ? "Orçamento atualizado com sucesso!" : "Orçamento salvo com sucesso!",
      );
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      navigate({ to: "/orcamentos" });
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível salvar o orçamento.");
    } finally {
      setSalvando(false);
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
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectItem(i)}
                    className={cn(
                      "w-full flex items-center justify-between rounded-md px-3 py-2 text-sm transition-all text-left",
                      isActive
                        ? "bg-accent text-foreground font-medium"
                        : "hover:bg-accent/60 text-foreground/80",
                    )}
                  >
                    <span>Item {i + 1}</span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {fmtMoney(itemSubtotals[i] ?? 0)}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={addNewItem}
              className="mt-2 w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-accent transition-colors"
            >
              <Plus className="h-4 w-4" />
              Orçar mais um produto
            </button>
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

              <div className="mt-10 flex justify-center">
                <div className="inline-flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "border-2 border-foreground/70 rounded-sm bg-muted/30 transition-all",
                        previewArt.empty && "border-dashed opacity-50",
                      )}
                      style={{ width: previewArt.w, height: previewArt.h }}
                    />
                    <div className="mt-3 text-sm font-medium text-foreground">
                      {larguraNum > 0 ? `${larguraNum} CM` : "—"}
                    </div>
                  </div>
                  <div
                    className="flex items-center text-sm font-medium text-foreground"
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
                </>
              )}

              {alturaNum > 0 && larguraNum > 0 && (
                <div className="mt-10 flex justify-center">
                  <div className="inline-flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className="relative border-2 border-foreground/70 rounded-sm bg-muted/50 transition-all"
                        style={{
                          width: previewPaspatur.outerW,
                          height: previewPaspatur.outerH,
                          paddingLeft: previewPaspatur.padLeft,
                          paddingRight: previewPaspatur.padRight,
                          paddingTop: previewPaspatur.padTop,
                          paddingBottom: previewPaspatur.padBottom,
                        }}
                      >
                        <div className="w-full h-full border-2 border-foreground/70 bg-background flex items-center justify-center">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Arte {larguraNum}×{alturaNum}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 text-sm font-medium text-foreground">
                        {larguraFinal} CM
                      </div>
                    </div>
                    <div
                      className="flex items-center text-sm font-medium text-foreground"
                      style={{ height: previewPaspatur.outerH }}
                    >
                      {alturaFinal} CM
                    </div>
                  </div>
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
                <Label htmlFor="vidro-tipo">Tipo</Label>
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
                <div className="mt-6 max-w-md space-y-1.5">
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
                  <Row
                    label={`Paspatur${paspaturSelecionado ? ` (${paspaturSelecionado.code})` : ""}`}
                    value={fmtMoney(valorPaspatur)}
                  />
                  <Row
                    label={`Perfil${perfilSelecionado ? ` (${perfilSelecionado.code})` : ""}`}
                    value={fmtMoney(valorPerfil)}
                  />
                  <Row
                    label={`Vidro${vidroSelecionado && vidroTipo === "sim" ? ` (${vidroSelecionado.code})` : ""}`}
                    value={fmtMoney(valorVidro)}
                  />
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

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <Button
                      type="button"
                      onClick={handleSalvar}
                      disabled={salvando}
                      className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
                    >
                      {salvando
                        ? "Salvando..."
                        : isEdit
                          ? "Atualizar Orçamento"
                          : "Salvar Orçamento"}
                    </Button>
                    <Button type="button" variant="outline" onClick={addNewItem}>
                      <Plus className="h-4 w-4 mr-1.5" />
                      Orçar mais um produto
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

