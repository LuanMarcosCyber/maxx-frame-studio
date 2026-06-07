import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/orcamentos/novo")({
  head: () => ({ meta: [{ title: "Novo Orçamento — Total Maxx ERP" }] }),
  component: NovoOrcamento,
});

type StepKey =
  | "tamanho"
  | "perfil"
  | "vidro"
  | "foam"
  | "paspatur"
  | "colagem"
  | "impressao"
  | "instalacao"
  | "finalizacao";

const steps: { key: StepKey; label: string; icon: typeof Ruler; enabled: boolean }[] = [
  { key: "tamanho", label: "Tamanho", icon: Ruler, enabled: true },
  { key: "perfil", label: "Perfil", icon: Frame, enabled: true },
  { key: "vidro", label: "Vidro / Espelho", icon: Square, enabled: true },
  { key: "foam", label: "Foam / MDF", icon: Layers, enabled: true },
  { key: "paspatur", label: "Paspatur", icon: ImageIcon, enabled: false },
  { key: "colagem", label: "Colagem", icon: Scissors, enabled: false },
  { key: "impressao", label: "Impressão", icon: Printer, enabled: false },
  { key: "instalacao", label: "Instalação / Frete", icon: Truck, enabled: false },
  { key: "finalizacao", label: "Finalização", icon: CheckCircle2, enabled: false },
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

function NovoOrcamento() {
  const { session } = useAuth();
  const [active, setActive] = useState<StepKey>("tamanho");
  const [altura, setAltura] = useState<string>("");
  const [largura, setLargura] = useState<string>("");
  const [perfilId, setPerfilId] = useState<string>("");
  const [vidroTipo, setVidroTipo] = useState<"sim" | "nao">("nao");
  const [vidroId, setVidroId] = useState<string>("");
  const [foamId, setFoamId] = useState<string>("");

  const { data: perfis = [], isLoading: loadingPerfis } = useQuery({
    queryKey: ["products", "Perfil"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, description, value_per_meter, profit_margin, waste_percentage, category")
        .eq("category", "Perfil")
        .order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Produto[];
    },
  });

  const { data: vidros = [], isLoading: loadingVidros } = useQuery({
    queryKey: ["products", "Vidro"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, description, value_per_meter, profit_margin, waste_percentage, category")
        .eq("category", "Vidro")
        .order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Produto[];
    },
  });

  const { data: foams = [], isLoading: loadingFoams } = useQuery({
    queryKey: ["products", "Foam-MDF"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, description, value_per_meter, profit_margin, waste_percentage, category")
        .in("category", ["Foam", "MDF"])
        .order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Produto[];
    },
  });

  const perfilSelecionado = useMemo(
    () => perfis.find((p) => p.id === perfilId) ?? null,
    [perfis, perfilId],
  );
  const vidroSelecionado = useMemo(
    () => vidros.find((p) => p.id === vidroId) ?? null,
    [vidros, vidroId],
  );
  const foamSelecionado = useMemo(
    () => foams.find((p) => p.id === foamId) ?? null,
    [foams, foamId],
  );

  const alturaNum = parseNum(altura);
  const larguraNum = parseNum(largura);

  const valorPerfil = useMemo(() => {
    if (!perfilSelecionado || alturaNum <= 0 || larguraNum <= 0) return 0;
    const perimetro = ((alturaNum + larguraNum) * 2) / 100;
    const base = perimetro * Number(perfilSelecionado.value_per_meter);
    const comPerda = base * (1 + Number(perfilSelecionado.waste_percentage) / 100);
    const final = comPerda * (1 + Number(perfilSelecionado.profit_margin) / 100);
    return final;
  }, [perfilSelecionado, alturaNum, larguraNum]);

  const valorVidro = useMemo(
    () => (vidroTipo === "sim" ? calcAreaValue(vidroSelecionado, alturaNum, larguraNum) : 0),
    [vidroTipo, vidroSelecionado, alturaNum, larguraNum],
  );

  const valorFoam = useMemo(
    () => calcAreaValue(foamSelecionado, alturaNum, larguraNum),
    [foamSelecionado, alturaNum, larguraNum],
  );

  const valorTotal = valorPerfil + valorVidro + valorFoam;

  const previewDims = useMemo(() => {
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

  return (
    <AppShell title="Novo Orçamento" subtitle="Monte o orçamento por etapas">
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Stepper sidebar */}
        <Card className="p-3 h-fit">
          <nav className="space-y-1">
            {steps.map((s) => {
              const isActive = active === s.key;
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={!s.enabled}
                  onClick={() => s.enabled && setActive(s.key)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all text-left",
                    isActive
                      ? "bg-gradient-brand text-brand-foreground shadow-brand"
                      : s.enabled
                        ? "text-foreground/80 hover:bg-accent hover:text-foreground"
                        : "text-muted-foreground/60 cursor-not-allowed",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{s.label}</span>
                  {!s.enabled && (
                    <span className="text-[10px] uppercase tracking-wider opacity-70">
                      em breve
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </Card>

        {/* Content area */}
        <div className="space-y-6">
          {/* Totals header */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-end gap-8">
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Valor do perfil
                </div>
                <div className="text-lg font-semibold">{fmtMoney(valorPerfil)}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Valor do vidro
                </div>
                <div className="text-lg font-semibold">{fmtMoney(valorVidro)}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Valor Foam / MDF
                </div>
                <div className="text-lg font-semibold">{fmtMoney(valorFoam)}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Valor total
                </div>
                <div className="text-2xl font-bold bg-gradient-brand bg-clip-text text-transparent">
                  {fmtMoney(valorTotal)}
                </div>
              </div>
            </div>
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

              {/* Preview */}
              <div className="mt-10 flex justify-center">
                <div className="inline-flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "border-2 border-foreground/70 rounded-sm bg-muted/30 transition-all",
                        previewDims.empty && "border-dashed opacity-50",
                      )}
                      style={{ width: previewDims.w, height: previewDims.h }}
                    />
                    <div className="mt-3 text-sm font-medium text-foreground">
                      {larguraNum > 0 ? `${larguraNum} CM` : "—"}
                    </div>
                  </div>
                  <div
                    className="flex items-center text-sm font-medium text-foreground"
                    style={{ height: previewDims.h }}
                  >
                    {alturaNum > 0 ? `${alturaNum} CM` : "—"}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {active === "perfil" && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold">Qual perfil será utilizado?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Informe abaixo qual perfil será utilizado no pedido
              </p>

              <div className="mt-6 max-w-md space-y-1.5">
                <Label htmlFor="perfil">Código</Label>
                <Select value={perfilId} onValueChange={setPerfilId}>
                  <SelectTrigger id="perfil">
                    <SelectValue
                      placeholder={
                        loadingPerfis ? "Carregando..." : "Selecione um perfil"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {perfis.length === 0 && !loadingPerfis ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Nenhum perfil cadastrado.
                      </div>
                    ) : (
                      perfis.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.code}
                          {p.description ? ` — ${p.description}` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {perfilSelecionado && (
                <div className="mt-6 rounded-md border border-border bg-muted/30 p-4 max-w-md">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Check className="h-4 w-4 text-emerald-600" />
                    Perfil selecionado
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground space-y-0.5">
                    <div>
                      <span className="font-medium text-foreground">Código:</span>{" "}
                      {perfilSelecionado.code}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Valor/m:</span>{" "}
                      {fmtMoney(Number(perfilSelecionado.value_per_meter))}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Perda:</span>{" "}
                      {Number(perfilSelecionado.waste_percentage)}%
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Margem:</span>{" "}
                      {Number(perfilSelecionado.profit_margin)}%
                    </div>
                    <div className="pt-2 border-t border-border mt-2">
                      <span className="font-medium text-foreground">
                        Valor do perfil:
                      </span>{" "}
                      <span className="font-semibold">{fmtMoney(valorPerfil)}</span>
                    </div>
                  </div>
                </div>
              )}

              {(alturaNum <= 0 || larguraNum <= 0) && (
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
                  <Select value={vidroId} onValueChange={setVidroId}>
                    <SelectTrigger id="vidro">
                      <SelectValue
                        placeholder={
                          loadingVidros ? "Carregando..." : "Selecione um vidro"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {vidros.length === 0 && !loadingVidros ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Nenhum vidro cadastrado.
                        </div>
                      ) : (
                        vidros.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.code}
                            {p.description ? ` - ${p.description}` : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {vidroTipo === "sim" && vidroSelecionado && (
                <div className="mt-6 rounded-md border border-border bg-muted/30 p-4 max-w-md">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Check className="h-4 w-4 text-emerald-600" />
                    Vidro selecionado
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground space-y-0.5">
                    <div>
                      <span className="font-medium text-foreground">Código:</span>{" "}
                      {vidroSelecionado.code}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Valor/m²:</span>{" "}
                      {fmtMoney(Number(vidroSelecionado.value_per_meter))}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Perda:</span>{" "}
                      {Number(vidroSelecionado.waste_percentage)}%
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Margem:</span>{" "}
                      {Number(vidroSelecionado.profit_margin)}%
                    </div>
                    <div className="pt-2 border-t border-border mt-2">
                      <span className="font-medium text-foreground">
                        Valor do vidro:
                      </span>{" "}
                      <span className="font-semibold">{fmtMoney(valorVidro)}</span>
                    </div>
                  </div>
                </div>
              )}

              {vidroTipo === "sim" && (alturaNum <= 0 || larguraNum <= 0) && (
                <p className="mt-4 text-xs text-amber-600">
                  Informe altura e largura na etapa Tamanho para calcular o valor.
                </p>
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
                <Select value={foamId} onValueChange={setFoamId}>
                  <SelectTrigger id="foam">
                    <SelectValue
                      placeholder={
                        loadingFoams ? "Carregando..." : "Selecione um produto"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {foams.length === 0 && !loadingFoams ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Nenhum produto cadastrado.
                      </div>
                    ) : (
                      foams.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.code}
                          {p.description ? ` - ${p.description}` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {foamSelecionado && (
                <div className="mt-6 rounded-md border border-border bg-muted/30 p-4 max-w-md">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Check className="h-4 w-4 text-emerald-600" />
                    Produto selecionado
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground space-y-0.5">
                    <div>
                      <span className="font-medium text-foreground">Código:</span>{" "}
                      {foamSelecionado.code}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Categoria:</span>{" "}
                      {foamSelecionado.category}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Valor/m²:</span>{" "}
                      {fmtMoney(Number(foamSelecionado.value_per_meter))}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Perda:</span>{" "}
                      {Number(foamSelecionado.waste_percentage)}%
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Margem:</span>{" "}
                      {Number(foamSelecionado.profit_margin)}%
                    </div>
                    <div className="pt-2 border-t border-border mt-2">
                      <span className="font-medium text-foreground">
                        Valor Foam/MDF:
                      </span>{" "}
                      <span className="font-semibold">{fmtMoney(valorFoam)}</span>
                    </div>
                  </div>
                </div>
              )}

              {foamSelecionado && (alturaNum <= 0 || larguraNum <= 0) && (
                <p className="mt-4 text-xs text-amber-600">
                  Informe altura e largura na etapa Tamanho para calcular o valor.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
