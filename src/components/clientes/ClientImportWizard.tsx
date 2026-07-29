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
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { cn, fmtCPF, fmtCNPJ } from "@/lib/utils";
import { clientDedupeKey } from "@/lib/client-dedupe";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported: () => void;
};

type Row = Record<string, string>;

type FieldKey =
  | "name"
  | "document"
  | "commercial_phone"
  | "mobile_phone"
  | "email"
  | "cep"
  | "address"
  | "address_number"
  | "complement"
  | "neighborhood"
  | "city"
  | "state"
  | "notes";

type FieldDef = { key: FieldKey; label: string; required?: boolean };

const FIELDS: FieldDef[] = [
  { key: "name", label: "Nome", required: true },
  { key: "document", label: "CPF/CNPJ" },
  { key: "commercial_phone", label: "Telefone" },
  { key: "mobile_phone", label: "WhatsApp / Celular" },
  { key: "email", label: "E-mail" },
  { key: "cep", label: "CEP" },
  { key: "address", label: "Endereço" },
  { key: "address_number", label: "Número" },
  { key: "complement", label: "Complemento" },
  { key: "neighborhood", label: "Bairro" },
  { key: "city", label: "Cidade" },
  { key: "state", label: "Estado" },
  { key: "notes", label: "Observações" },
];

type Mapping = Record<FieldKey, string>; // column name or ""

const emptyMapping = (): Mapping =>
  FIELDS.reduce((acc, f) => {
    acc[f.key] = "";
    return acc;
  }, {} as Mapping);

const normalize = (s: string) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const onlyDigits = (s: string) => String(s ?? "").replace(/\D+/g, "");

// Heuristic mapping between column header text and target field.
const AUTO_MAP: { key: FieldKey; keywords: string[] }[] = [
  { key: "name", keywords: ["nome", "cliente", "razao", "fantasia"] },
  { key: "document", keywords: ["cpf", "cnpj", "documento", "cpf/cnpj"] },
  { key: "commercial_phone", keywords: ["telefone", "fone", "comercial", "tel"] },
  { key: "mobile_phone", keywords: ["celular", "whatsapp", "whats", "movel", "móvel"] },
  { key: "email", keywords: ["email", "e-mail", "mail"] },
  { key: "cep", keywords: ["cep"] },
  { key: "address", keywords: ["endereco", "endereço", "rua", "logradouro"] },
  { key: "address_number", keywords: ["numero", "número", "num", "nº"] },
  { key: "complement", keywords: ["complemento", "compl"] },
  { key: "neighborhood", keywords: ["bairro"] },
  { key: "city", keywords: ["cidade", "municipio", "município"] },
  { key: "state", keywords: ["estado", "uf"] },
  { key: "notes", keywords: ["observ", "obs", "nota"] },
];

function autoMap(columns: string[]): Mapping {
  const m = emptyMapping();
  for (const col of columns) {
    const n = normalize(col);
    for (const { key, keywords } of AUTO_MAP) {
      if (m[key]) continue;
      if (keywords.some((k) => n.includes(k))) {
        m[key] = col;
        break;
      }
    }
  }
  return m;
}

function formatDocument(raw: string): string {
  const d = onlyDigits(raw);
  if (d.length === 11) return fmtCPF(d);
  if (d.length === 14) return fmtCNPJ(d);
  return raw.trim();
}

export function ClientImportWizard({ open, onOpenChange, onImported }: Props) {
  const { session, ownerUserId } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState("");
  const [rawMatrix, setRawMatrix] = useState<string[][]>([]);
  const [sheets, setSheets] = useState<
    { name: string; matrix: string[][]; dataRowCount: number }[]
  >([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [headerRow, setHeaderRow] = useState<number>(0);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Mapping>(emptyMapping());
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    processed: number;
    imported: number;
    duplicates: number;
    errors: { line: number; reason: string }[];
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(1);
    setFileName("");
    setRawMatrix([]);
    setSheets([]);
    setSelectedSheet("");
    setHeaderRow(0);
    setColumns([]);
    setRows([]);
    setMapping(emptyMapping());
    setResult(null);
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const HEADER_KEYWORDS = [
    "nome",
    "cliente",
    "cpf",
    "cnpj",
    "telefone",
    "celular",
    "whatsapp",
    "email",
    "e-mail",
    "cep",
    "endereco",
    "endereço",
    "cidade",
    "estado",
    "uf",
    "bairro",
  ];

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
    const maxLen = Math.max(
      headerCells.length,
      ...matrix.slice(hRow + 1).map((r) => r.length),
      0,
    );
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
      const isRepeat = cols.every(
        (c, i) => normalize(String(rowArr[i] ?? "")) === normalize(c),
      );
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
    setMapping(autoMap(cols));
  };

  const changeHeaderRow = (idx: number) => {
    setHeaderRow(idx);
    applyHeader(rawMatrix, idx);
  };

  const countDataRows = (matrix: string[][]) =>
    matrix.filter((r) => (r ?? []).some((c) => String(c ?? "").trim() !== "")).length;

  const loadSheet = (
    name: string,
    all: { name: string; matrix: string[][]; dataRowCount: number }[],
  ) => {
    const s = all.find((x) => x.name === name);
    if (!s) return;
    setSelectedSheet(name);
    setRawMatrix(s.matrix);
    const detected = detectHeaderRow(s.matrix);
    setHeaderRow(detected);
    applyHeader(s.matrix, detected);
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
        const parsed = Papa.parse<string[]>(text, {
          header: false,
          skipEmptyLines: false,
        });
        const matrix = (parsed.data as any[][]).map((r) =>
          (r ?? []).map((c) => String(c ?? "").trim()),
        );
        allSheets = [{ name: "CSV", matrix, dataRowCount: countDataRows(matrix) }];
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        allSheets = wb.SheetNames.map((sn) => {
          const sheet = wb.Sheets[sn];
          const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, {
            header: 1,
            defval: "",
            raw: false,
            blankrows: true,
          });
          const matrix = aoa.map((r) =>
            (r ?? []).map((c) => String(c ?? "").trim()),
          );
          return { name: sn, matrix, dataRowCount: countDataRows(matrix) };
        });
      }
      setSheets(allSheets);
      const firstNonEmpty =
        allSheets.find((s) => s.dataRowCount > 0) ?? allSheets[0];
      if (!firstNonEmpty) {
        toast.error("Nenhuma aba com dados encontrada.");
        return;
      }
      loadSheet(firstNonEmpty.name, allSheets);
      setStep(2);
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

  function buildRow(r: Row, m: Mapping): Record<FieldKey, string> {
    const out = {} as Record<FieldKey, string>;
    FIELDS.forEach((f) => {
      const col = m[f.key];
      out[f.key] = (col && r[col] != null ? String(r[col]) : "").trim();
    });
    return out;
  }

  const previewRows = useMemo(
    () => rows.slice(0, 10).map((r) => buildRow(r, mapping)),
    [rows, mapping],
  );

  const validationSummary = useMemo(() => {
    let ok = 0;
    const errs: { line: number; reason: string }[] = [];
    rows.forEach((r, idx) => {
      const built = buildRow(r, mapping);
      if (!built.name) {
        errs.push({ line: idx + 2, reason: "Nome ausente" });
        return;
      }
      ok++;
    });
    return { total: rows.length, valid: ok, invalid: errs.length, errors: errs };
  }, [rows, mapping]);

  const canGoStep3 = !!mapping.name;

  const doImport = async () => {
    if (!session?.user?.id) {
      toast.error("Sessão expirada.");
      return;
    }
    setImporting(true);
    const ownerId = ownerUserId ?? session.user.id;
    const errors: { line: number; reason: string }[] = [];
    const payloads: any[] = [];
    const seenKeys = new Set<string>();

    rows.forEach((r, idx) => {
      const built = buildRow(r, mapping);
      if (!built.name) {
        errors.push({ line: idx + 2, reason: "Nome ausente" });
        return;
      }
      const doc = built.document ? formatDocument(built.document) : "";
      const digits = onlyDigits(doc);
      const customer_type = digits.length === 14 ? "pessoa_juridica" : "pessoa_fisica";
      const commercial = built.commercial_phone || null;
      const mobile = built.mobile_phone || null;

      const payload = {
        user_id: ownerId,
        name: built.name.toUpperCase(),
        customer_type,
        document: doc || null,
        commercial_phone: commercial,
        mobile_phone: mobile,
        phone: commercial,
        whatsapp: mobile,
        email: built.email || null,
        cep: built.cep || null,
        address:
          [built.address, built.complement].filter(Boolean).join(" - ") || null,
        address_number: built.address_number || null,
        city: built.city || null,
        state: (built.state || "").toUpperCase().slice(0, 2) || null,
        notes: built.notes || null,
      };

      // duplicado apenas se TODOS os campos principais forem iguais
      const key = clientDedupeKey(payload);
      if (seenKeys.has(key)) {
        errors.push({ line: idx + 2, reason: "Registro idêntico na planilha" });
        return;
      }
      seenKeys.add(key);

      payloads.push({ ...payload, _line: idx + 2, _key: key });
    });

    try {
      // Fetch existing clients for dedupe
      const { data: existing, error: exErr } = await supabase
        .from("clients")
        .select(
          "name, document, phone, whatsapp, commercial_phone, mobile_phone, email, address, address_number, cep, city, state",
        );
      if (exErr) throw exErr;
      const existingKeys = new Set<string>(
        (existing ?? []).map((c: any) => clientDedupeKey(c)),
      );

      let duplicates = 0;
      const toInsert: any[] = [];
      for (const p of payloads) {
        if (existingKeys.has(p._key)) {
          duplicates++;
          continue;
        }
        const { _line, _key, ...clean } = p;
        toInsert.push(clean);
      }

      let written = 0;
      const chunk = 500;
      for (let i = 0; i < toInsert.length; i += chunk) {
        const slice = toInsert.slice(i, i + chunk);
        const { data, error } = await supabase
          .from("clients")
          .insert(slice)
          .select("id");
        if (error) throw error;
        written += Array.isArray(data) ? data.length : slice.length;
      }

      await qc.invalidateQueries({ queryKey: ["clients"] });
      await qc.invalidateQueries({ queryKey: ["clients", "picker"] });

      setResult({
        processed: rows.length,
        imported: written,
        duplicates,
        errors,
      });
      onImported();
      toast.success(`${written} cliente(s) importado(s).`);
      if (duplicates) toast.info(`${duplicates} cliente(s) já existente(s).`);
      if (errors.length) toast.warning(`${errors.length} linha(s) ignorada(s).`);
    } catch (e: any) {
      toast.error("Erro ao importar: " + (e?.message ?? "desconhecido"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Importar clientes — Passo {result ? 4 : step} de 4
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: Upload */}
        {!result && step === 1 && (
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
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-sm">
                {isDragging
                  ? "Solte o arquivo aqui"
                  : "Clique ou arraste o arquivo para esta área"}
              </div>
              <div className="text-xs text-muted-foreground">
                {fileName || "Nenhum arquivo selecionado"}
              </div>
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

        {/* STEP 2: Mapping */}
        {!result && step === 2 && (
          <div className="space-y-4 py-2">
            <div className="rounded-md bg-accent/40 p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <FileSpreadsheet className="h-4 w-4" /> {fileName}
              </div>
              {sheets.length > 1 && (
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <Label className="text-xs">Aba:</Label>
                  <Select value={selectedSheet} onValueChange={changeSheet}>
                    <SelectTrigger className="h-8 max-w-[420px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sheets.map((s) => (
                        <SelectItem
                          key={s.name}
                          value={s.name}
                          disabled={s.dataRowCount === 0}
                        >
                          {s.name} —{" "}
                          {s.dataRowCount === 0
                            ? "aba vazia"
                            : `${s.dataRowCount} linha(s) com dados`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Cabeçalho na linha <b>{headerRow + 1}</b>. Detectamos{" "}
                <b>{rows.length}</b> cliente(s) e <b>{columns.length}</b> coluna(s).
              </div>
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <Label className="text-xs">Alterar linha do cabeçalho:</Label>
                <Select
                  value={String(headerRow)}
                  onValueChange={(v) => changeHeaderRow(Number(v))}
                >
                  <SelectTrigger className="h-8 max-w-[420px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rawMatrix.slice(0, 20).map((r, i) => {
                      const preview =
                        r
                          .filter((c) => String(c ?? "").trim() !== "")
                          .slice(0, 6)
                          .join(" | ") || "(linha vazia)";
                      return (
                        <SelectItem key={i} value={String(i)}>
                          Linha {i + 1}:{" "}
                          {preview.length > 80 ? preview.slice(0, 80) + "…" : preview}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Para cada campo do cliente, escolha a coluna correspondente da planilha.
              Campos não mapeados ficarão vazios.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-xs">
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={mapping[f.key] || "__none__"}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [f.key]: v === "__none__" ? "" : v }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Não mapear —</SelectItem>
                      {columns.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: Preview + validation */}
        {!result && step === 3 && (
          <div className="space-y-4 py-2">
            <Card className="p-4 space-y-1 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <FileSpreadsheet className="h-4 w-4" /> Planilha carregada
              </div>
              <div className="text-muted-foreground">
                <b>{validationSummary.total}</b> cliente(s) encontrado(s) ·{" "}
                <b className="text-emerald-700">{validationSummary.valid}</b>{" "}
                válido(s) ·{" "}
                <b className="text-amber-700">{validationSummary.invalid}</b> com
                inconsistência(s)
              </div>
            </Card>

            <div className="overflow-x-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {FIELDS.filter((f) => mapping[f.key]).map((f) => (
                      <th key={f.key} className="text-left font-medium px-3 py-2">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className="border-t">
                      {FIELDS.filter((f) => mapping[f.key]).map((f) => (
                        <td key={f.key} className="px-3 py-2">
                          {r[f.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {validationSummary.invalid > 0 && (
              <Card className="p-4">
                <div className="flex items-center gap-2 font-medium text-sm mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Linhas com
                  inconsistência
                </div>
                <div className="max-h-40 overflow-y-auto text-xs space-y-1">
                  {validationSummary.errors.slice(0, 50).map((e, i) => (
                    <div key={i}>
                      Linha {e.line}: {e.reason}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* RESULT */}
        {result && (
          <div className="space-y-4 py-2">
            <Card className="p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
              <div className="text-sm space-y-1">
                <div className="font-medium">Importação concluída</div>
                <div className="text-muted-foreground">
                  {result.processed} linha(s) processada(s)
                </div>
                <div>
                  <b>{result.imported}</b> cliente(s) importado(s)
                </div>
                <div>
                  <b>{result.duplicates}</b> cliente(s) já existente(s)
                </div>
                <div>
                  <b>{result.errors.length}</b> cliente(s) com erro
                </div>
              </div>
            </Card>
            {result.errors.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center gap-2 font-medium text-sm mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Linhas
                  ignoradas
                </div>
                <div className="max-h-48 overflow-y-auto text-xs space-y-1">
                  {result.errors.map((e, i) => (
                    <div key={i}>
                      Linha {e.line}: {e.reason}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          {result ? (
            <Button className="ml-auto" onClick={() => handleClose(false)}>
              Concluir
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as any) : s))}
                disabled={step === 1 || importing}
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              {step < 3 ? (
                <Button
                  onClick={() => {
                    if (step === 1) {
                      if (!rows.length) return toast.error("Envie uma planilha.");
                      setStep(2);
                    } else if (step === 2) {
                      if (!canGoStep3)
                        return toast.error("Mapeie ao menos o campo Nome.");
                      setStep(3);
                    }
                  }}
                  className={cn("bg-gradient-brand text-brand-foreground hover:opacity-95")}
                >
                  Avançar <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={doImport}
                  disabled={importing || validationSummary.valid === 0}
                  className="bg-gradient-brand text-brand-foreground hover:opacity-95"
                >
                  {importing ? "Importando..." : "Importar clientes"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
