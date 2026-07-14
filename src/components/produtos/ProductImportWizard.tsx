import { useMemo, useRef, useState, DragEvent } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SupplierPicker,
  useSuppliersQuery,
  normalizeSupplierName,
  supplierLabel,
  productCategoryToSupplierCategory,
} from "@/components/suppliers/SupplierPicker";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: { key: string; label: string }[];
  defaultCategory: string;
  onImported: () => void;
};

type Row = Record<string, string>;

type FieldKey =
  | "code"
  | "description"
  | "value_per_meter"
  | "supplier"
  | "profit_margin"
  | "waste_percentage"
  | "labor_cost"
  | "commission_percentage"
  | "frame_width_cm"
  | "ncm";

type FieldDef = {
  key: FieldKey;
  label: string;
  required: boolean;
  numeric?: boolean;
  allowManualEmpty?: boolean;
  placeholder?: string;
};

const FIELDS: FieldDef[] = [
  { key: "code", label: "Código", required: true },
  { key: "description", label: "Descrição", required: true },
  { key: "value_per_meter", label: "Valor do metro", required: true, numeric: true },
  { key: "supplier", label: "Fornecedor / Fabricante", required: false },
  { key: "profit_margin", label: "Margem de lucro (%)", required: false, numeric: true, placeholder: "Ex: 100" },
  { key: "waste_percentage", label: "Perda (%)", required: false, numeric: true, placeholder: "20" },
  { key: "labor_cost", label: "Mão de obra (R$) — usado em Perfil", required: false, numeric: true, placeholder: "15,00" },
  { key: "commission_percentage", label: "Comissão (%)", required: false, numeric: true, placeholder: "5" },
  { key: "frame_width_cm", label: "Largura (cm) — usado em Perfil", required: false, numeric: true, placeholder: "Ex: 3" },
  { key: "ncm", label: "NCM", required: false, allowManualEmpty: true },
];

type Mapping = Record<
  FieldKey,
  { origin: "column" | "manual"; column: string; manual: string }
>;

const isPerfilOnly = (k: FieldKey) => k === "labor_cost" || k === "frame_width_cm";
const fieldsForCategory = (category: string): FieldDef[] =>
  category === "Perfil" ? FIELDS : FIELDS.filter((f) => !isPerfilOnly(f.key));

const initialMapping = (category?: string): Mapping =>
  FIELDS.reduce((acc, f) => {
    const isDefaultManual = ["supplier", "profit_margin", "waste_percentage", "labor_cost", "commission_percentage", "ncm"].includes(f.key);
    acc[f.key] = {
      origin: isDefaultManual ? "manual" : "column",
      column: "",
      manual: f.key === "labor_cost" && category === "Perfil" ? "15,00" : "",
    };
    return acc;
  }, {} as Mapping);

const parseNum = (s: string): number => {
  if (s == null) return NaN;
  const cleaned = String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
};

export function ProductImportWizard({ open, onOpenChange, categories, defaultCategory, onImported }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [category, setCategory] = useState(defaultCategory);
  const [fileName, setFileName] = useState("");
  const [rawMatrix, setRawMatrix] = useState<string[][]>([]);
  const [sheets, setSheets] = useState<{ name: string; matrix: string[][]; dataRowCount: number }[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [headerRow, setHeaderRow] = useState<number>(0); // 0-indexed
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Mapping>(initialMapping(defaultCategory));
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: { line: number; reason: string }[] } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [manualSupplierId, setManualSupplierId] = useState<string | null>(null);
  const [widthUnit, setWidthUnit] = useState<"cm" | "mm">("cm");
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: allSuppliers = [] } = useSuppliersQuery();

  const supplierByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of allSuppliers) {
      const label = supplierLabel(s);
      const keys = [label, s.legal_name, s.trade_name].filter(Boolean) as string[];
      for (const k of keys) {
        const nk = normalizeSupplierName(k);
        if (nk && !m.has(nk)) m.set(nk, s.id);
      }
    }
    return m;
  }, [allSuppliers]);
  const manualSupplier = useMemo(
    () => allSuppliers.find((s) => s.id === manualSupplierId) ?? null,
    [allSuppliers, manualSupplierId],
  );

  const reset = () => {
    setStep(1);
    setCategory(defaultCategory);
    setFileName("");
    setRawMatrix([]);
    setSheets([]);
    setSelectedSheet("");
    setHeaderRow(0);
    setColumns([]);
    setRows([]);
    setMapping(initialMapping(defaultCategory));
    setResult(null);
    setManualSupplierId(null);
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const HEADER_KEYWORDS = [
    "codigo","código","perfil","descricao","descrição","acabamento","status",
    "alt","altura","larg","largura","valor","preco","preço","custo","a vista","à vista",
    "ncm","fornecedor","fabricante","tipo","madeira","margem","comissao","comissão","perda"
  ];

  const normalize = (s: string) =>
    String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const detectHeaderRow = (matrix: string[][]): number => {
    const limit = Math.min(20, matrix.length);
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < limit; i++) {
      const row = matrix[i] ?? [];
      const filled = row.filter((c) => String(c ?? "").trim() !== "").length;
      if (filled < 2) continue;
      let kw = 0;
      for (const cell of row) {
        const n = normalize(String(cell));
        if (!n) continue;
        if (HEADER_KEYWORDS.some((k) => n.includes(k))) kw++;
      }
      const score = kw * 10 + filled;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  const buildFromMatrix = (matrix: string[][], hRow: number) => {
    const headerCells = matrix[hRow] ?? [];
    const maxLen = Math.max(headerCells.length, ...matrix.slice(hRow + 1).map((r) => r.length), 0);
    const seen = new Map<string, number>();
    const cols: string[] = [];
    for (let i = 0; i < maxLen; i++) {
      let name = String(headerCells[i] ?? "").trim();
      if (!name || /^__empty/i.test(name)) name = `Coluna ${i + 1}`;
      const n = seen.get(name) ?? 0;
      seen.set(name, n + 1);
      cols.push(n === 0 ? name : `${name} (${n + 1})`);
    }
    const dataRows: Row[] = [];
    for (let r = hRow + 1; r < matrix.length; r++) {
      const rowArr = matrix[r] ?? [];
      const filled = rowArr.filter((c) => String(c ?? "").trim() !== "").length;
      if (filled === 0) continue;
      const isRepeat = cols.every((c, i) => normalize(String(rowArr[i] ?? "")) === normalize(c));
      if (isRepeat) continue;
      const o: Row = {};
      cols.forEach((c, i) => (o[c] = String(rowArr[i] ?? "").trim()));
      dataRows.push(o);
    }
    return { cols, dataRows };
  };

  const applyHeader = (matrix: string[][], hRow: number) => {
    const { cols, dataRows } = buildFromMatrix(matrix, hRow);
    setColumns(cols);
    setRows(dataRows);
  };

  const changeHeaderRow = (idx: number) => {
    setHeaderRow(idx);
    applyHeader(rawMatrix, idx);
    setMapping(initialMapping(category));
  };

  const countDataRows = (matrix: string[][]) =>
    matrix.filter((r) => (r ?? []).some((c) => String(c ?? "").trim() !== "")).length;

  const loadSheet = (name: string, all: { name: string; matrix: string[][]; dataRowCount: number }[]) => {
    const s = all.find((x) => x.name === name);
    if (!s) return;
    setSelectedSheet(name);
    setRawMatrix(s.matrix);
    const detected = detectHeaderRow(s.matrix);
    setHeaderRow(detected);
    applyHeader(s.matrix, detected);
    setMapping(initialMapping(category));
  };

  const changeSheet = (name: string) => loadSheet(name, sheets);

  const handleFile = async (file: File) => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) {
      toast.error("Formato inválido. Envie um arquivo .xlsx ou .csv.");
      return;
    }
    setFileName(file.name);
    try {
      let allSheets: { name: string; matrix: string[][]; dataRowCount: number }[] = [];
      if (lower.endsWith(".csv")) {
        const text = await file.text();
        const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: false });
        const matrix = (parsed.data as any[][]).map((r) => (r ?? []).map((c) => String(c ?? "").trim()));
        allSheets = [{ name: "CSV", matrix, dataRowCount: countDataRows(matrix) }];
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        allSheets = wb.SheetNames.map((sn) => {
          const sheet = wb.Sheets[sn];
          const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "", raw: false, blankrows: true });
          const matrix = aoa.map((r) => (r ?? []).map((c) => String(c ?? "").trim()));
          return { name: sn, matrix, dataRowCount: countDataRows(matrix) };
        });
      }
      setSheets(allSheets);
      const firstNonEmpty = allSheets.find((s) => s.dataRowCount > 0) ?? allSheets[0];
      if (!firstNonEmpty) {
        toast.error("Nenhuma aba com dados encontrada.");
        return;
      }
      loadSheet(firstNonEmpty.name, allSheets);
      setStep(3);
    } catch (e: any) {
      toast.error("Erro ao ler planilha: " + (e?.message ?? "desconhecido"));
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const previewRows = useMemo(() => {
    return rows.slice(0, 10).map((r) => buildRow(r, mapping));
  }, [rows, mapping]);

  function buildRow(r: Row, m: Mapping) {
    const out: Record<FieldKey, string> = {} as any;
    FIELDS.forEach((f) => {
      const cfg = m[f.key];
      if (cfg.origin === "manual") out[f.key] = cfg.manual.trim();
      else out[f.key] = (cfg.column && r[cfg.column] != null ? String(r[cfg.column]) : "").trim();
    });
    return out;
  }

  const canGoStep4 = useMemo(() => {
    for (const f of FIELDS) {
      if (!f.required) continue;
      const cfg = mapping[f.key];
      if (cfg.origin === "column" && !cfg.column) return false;
      if (cfg.origin === "manual" && !cfg.manual.trim()) return false;
    }
    // Se supplier for manual, exigir picker OU texto livre
    const sup = mapping.supplier;
    if (sup.origin === "manual" && !sup.manual.trim() && !manualSupplierId) return false;
    return true;
  }, [mapping, manualSupplierId]);

  const doImport = async () => {
    if (!user) return;
    setImporting(true);
    const errors: { line: number; reason: string }[] = [];
    const payloads: any[] = [];
    rows.forEach((r, idx) => {
      const built = buildRow(r, mapping);
      const missing: string[] = [];
      if (!built.code) missing.push("Código");
      if (!built.description) missing.push("Descrição");
      const value = parseNum(built.value_per_meter);
      if (!built.value_per_meter || Number.isNaN(value)) missing.push("Valor do metro");
      if (missing.length) {
        errors.push({ line: idx + 2, reason: "Faltando: " + missing.join(", ") });
        return;
      }
      const margin = built.profit_margin ? parseNum(built.profit_margin) : 0;
      const waste = built.waste_percentage ? parseNum(built.waste_percentage) : 0;
      const commission = built.commission_percentage ? parseNum(built.commission_percentage) : 0;
      const frameWidth = built.frame_width_cm ? parseNum(built.frame_width_cm) : NaN;
      const laborCost = built.labor_cost ? parseNum(built.labor_cost) : NaN;

      // Resolve supplier text and supplier_id
      let supplierText = built.supplier || null;
      let supplierId: string | null = null;
      if (mapping.supplier.origin === "manual" && manualSupplier) {
        supplierText = supplierLabel(manualSupplier).toUpperCase();
        supplierId = manualSupplier.id;
      } else if (supplierText) {
        supplierId = supplierByName.get(normalizeSupplierName(supplierText)) ?? null;
      }

      payloads.push({
        user_id: user.id,
        code: built.code,
        description: built.description,
        category,
        value_per_meter: value,
        profit_margin: Number.isFinite(margin) ? margin : 0,
        waste_percentage: Number.isFinite(waste) ? waste : 0,
        commission_percentage: Number.isFinite(commission) ? commission : 0,
        frame_width_cm: Number.isFinite(frameWidth) ? frameWidth : null,
        labor_cost: Number.isFinite(laborCost) ? laborCost : 0,
        supplier: supplierText,
        supplier_id: supplierId,
        ncm: built.ncm || null,
      });
    });

    try {
      if (payloads.length) {
        // chunked insert
        const chunk = 500;
        for (let i = 0; i < payloads.length; i += chunk) {
          const { error } = await supabase.from("products").insert(payloads.slice(i, i + chunk));
          if (error) throw error;
        }
      }
      setResult({ imported: payloads.length, skipped: errors.length, errors });
      onImported();
      if (payloads.length) toast.success(`${payloads.length} produto(s) importado(s).`);
      if (errors.length) toast.warning(`${errors.length} linha(s) ignorada(s).`);
    } catch (e: any) {
      toast.error("Erro ao importar: " + (e?.message ?? "desconhecido"));
    } finally {
      setImporting(false);
    }
  };

  const updateMap = (k: FieldKey, patch: Partial<Mapping[FieldKey]>) =>
    setMapping((m) => ({ ...m, [k]: { ...m[k], ...patch } }));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar produtos — Passo {result ? 5 : step} de 5</DialogTitle>
        </DialogHeader>

        {/* STEP 1 */}
        {!result && step === 1 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Escolha a categoria de destino dos produtos que serão importados.
            </p>
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {!result && step === 2 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Envie sua planilha nos formatos <b>.xlsx</b> ou <b>.csv</b>.
            </p>
            <Card
              className={cn(
                "p-8 border-dashed border-2 flex flex-col items-center gap-3 cursor-pointer transition-colors",
                isDragging ? "bg-accent/60 border-primary" : "hover:bg-accent/40",
              )}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-sm">
                {isDragging ? "Solte o arquivo aqui" : "Clique ou arraste o arquivo para esta área"}
              </div>
              <div className="text-xs text-muted-foreground">{fileName || "Nenhum arquivo selecionado"}</div>
            </Card>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
        )}

        {/* STEP 3 */}
        {!result && step === 3 && (
          <div className="space-y-4 py-2">
            <div className="rounded-md bg-accent/40 p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <FileSpreadsheet className="h-4 w-4" /> {fileName}
              </div>
              {sheets.length > 1 && (
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <Label className="text-xs">Aba:</Label>
                  <Select value={selectedSheet} onValueChange={changeSheet}>
                    <SelectTrigger className="h-8 max-w-[420px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sheets.map((s) => (
                        <SelectItem key={s.name} value={s.name} disabled={s.dataRowCount === 0}>
                          {s.name} — {s.dataRowCount === 0 ? "aba vazia" : `${s.dataRowCount} linha(s) com dados`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                {sheets.length > 1 && <>Aba <b>{selectedSheet}</b> · </>}
                Cabeçalho detectado na linha <b>{headerRow + 1}</b>. Detectamos <b>{rows.length}</b> produto(s) e{" "}
                <b>{columns.length}</b> coluna(s).
              </div>
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <Label className="text-xs">Alterar linha do cabeçalho:</Label>
                <Select value={String(headerRow)} onValueChange={(v) => changeHeaderRow(Number(v))}>
                  <SelectTrigger className="h-8 max-w-[420px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {rawMatrix.slice(0, 20).map((r, i) => {
                      const preview = r.filter((c) => String(c ?? "").trim() !== "").slice(0, 6).join(" | ") || "(linha vazia)";
                      return (
                        <SelectItem key={i} value={String(i)}>
                          Linha {i + 1}: {preview.length > 80 ? preview.slice(0, 80) + "…" : preview}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground break-words">
                Colunas: {columns.join(", ")}
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Para cada campo do produto, escolha se deve vir de uma coluna da planilha ou ser preenchido manualmente
              (todos os produtos recebem o mesmo valor).
            </p>

            {fieldsForCategory(category).map((f) => {
              const cfg = mapping[f.key];
              return (
                <Card key={f.key} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">
                      {f.label} {f.required && <span className="text-destructive">*</span>}
                    </div>
                  </div>
                  <RadioGroup
                    value={cfg.origin}
                    onValueChange={(v) => updateMap(f.key, { origin: v as "column" | "manual" })}
                    className="flex gap-6"
                  >
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value="column" /> Coluna da planilha
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value="manual" /> Valor manual
                    </label>
                  </RadioGroup>
                  {cfg.origin === "column" ? (
                    <Select value={cfg.column} onValueChange={(v) => updateMap(f.key, { column: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione a coluna" /></SelectTrigger>
                      <SelectContent>
                        {columns.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : f.key === "supplier" ? (
                    <div className="space-y-2">
                      <SupplierPicker
                        value={manualSupplierId}
                        legacyText={cfg.manual}
                        preferredCategory={productCategoryToSupplierCategory(category)}
                        onChange={(id, opt) => {
                          setManualSupplierId(id);
                          if (opt) updateMap(f.key, { manual: supplierLabel(opt).toUpperCase() });
                        }}
                        placeholder="Vincular ao fornecedor cadastrado..."
                      />
                      <Input
                        placeholder="Ou digite um nome livre (sem vínculo)"
                        value={cfg.manual}
                        onChange={(e) => {
                          setManualSupplierId(null);
                          updateMap(f.key, { manual: e.target.value.toUpperCase() });
                        }}
                      />
                      {manualSupplierId && (
                        <p className="text-[11px] text-emerald-700">
                          Todos os produtos ficarão vinculados ao fornecedor selecionado.
                        </p>
                      )}
                    </div>
                  ) : (
                    <Input
                      placeholder={f.placeholder ?? (f.numeric ? "Ex: 300" : "Digite o valor")}
                      value={cfg.manual}
                      onChange={(e) => updateMap(f.key, { manual: e.target.value })}
                    />
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* STEP 4 */}
        {!result && step === 4 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Confira uma prévia com até 10 produtos. Se estiver tudo certo, confirme a importação.
            </p>
            <div className="overflow-x-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {fieldsForCategory(category).map((f) => (
                      <th key={f.key} className="text-left font-medium px-3 py-2">{f.label.split(" —")[0].split(" (")[0]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className="border-t">
                      {fieldsForCategory(category).map((f) => (
                        <td key={f.key} className="px-3 py-2">{r[f.key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-muted-foreground">
              Total a importar: <b>{rows.length}</b> linha(s) na categoria{" "}
              <b>{categories.find((c) => c.key === category)?.label}</b>.
            </div>
          </div>
        )}

        {/* RESULT */}
        {result && (
          <div className="space-y-4 py-2">
            <Card className="p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
              <div>
                <div className="font-medium text-sm">{result.imported} produto(s) importado(s).</div>
                {result.skipped > 0 && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {result.skipped} produto(s) ignorado(s) por dados obrigatórios ausentes.
                  </div>
                )}
              </div>
            </Card>
            {result.errors.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center gap-2 font-medium text-sm mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Linhas ignoradas
                </div>
                <div className="max-h-48 overflow-y-auto text-xs space-y-1">
                  {result.errors.map((e, i) => (
                    <div key={i}>Linha {e.line}: {e.reason}</div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          {result ? (
            <Button className="ml-auto" onClick={() => handleClose(false)}>Fechar</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as any) : s))}
                disabled={step === 1 || importing}
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              {step < 4 ? (
                <Button
                  onClick={() => {
                    if (step === 1) {
                      if (!category) return toast.error("Escolha uma categoria.");
                      setStep(2);
                    } else if (step === 2) {
                      if (!rows.length) return toast.error("Envie uma planilha.");
                      setStep(3);
                    } else if (step === 3) {
                      if (!canGoStep4) return toast.error("Preencha todos os campos obrigatórios.");
                      setStep(4);
                    }
                  }}
                  className={cn("bg-gradient-brand text-brand-foreground hover:opacity-95")}
                >
                  Avançar <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={doImport}
                  disabled={importing}
                  className="bg-gradient-brand text-brand-foreground hover:opacity-95"
                >
                  {importing ? "Importando..." : "Importar produtos"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
