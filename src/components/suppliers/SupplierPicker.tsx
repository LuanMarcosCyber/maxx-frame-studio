import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Globe2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export type SupplierOption = {
  id: string;
  legal_name: string | null;
  trade_name: string | null;
  is_global: boolean;
  categories: string[];
};

export const SUPPLIER_CATEGORIES: { key: string; label: string }[] = [
  { key: "foam", label: "Foam" },
  { key: "paspatur", label: "Paspatur" },
  { key: "impressao", label: "Impressão" },
  { key: "perfil", label: "Perfil" },
  { key: "vidro", label: "Vidro" },
  { key: "colagem", label: "Colagem" },
  { key: "diversos", label: "Produtos Diversos" },
];

/** Mapeia a categoria do produto para o slug de fornecedor. */
export function productCategoryToSupplierCategory(
  cat: string | null | undefined,
): string | null {
  if (!cat) return null;
  const n = cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("foam")) return "foam";
  if (n.includes("paspatur")) return "paspatur";
  if (n.includes("impress")) return "impressao";
  if (n.includes("perfil")) return "perfil";
  if (n.includes("vidro")) return "vidro";
  if (n.includes("colagem") || n.includes("cola")) return "colagem";
  if (n.includes("divers")) return "diversos";
  return null;
}

export function supplierLabel(s: SupplierOption): string {
  return (s.trade_name?.trim() || s.legal_name?.trim() || "—") as string;
}

export function useSuppliersQuery() {
  return useQuery({
    queryKey: ["suppliers", "picker"],
    queryFn: async (): Promise<SupplierOption[]> => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, legal_name, trade_name, is_global, categories, active")
        .eq("active", true)
        .order("is_global", { ascending: false })
        .order("trade_name", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

type Props = {
  value: string | null;
  onChange: (id: string | null, option: SupplierOption | null) => void;
  preferredCategory?: string | null;
  legacyText?: string | null;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

export function SupplierPicker({
  value,
  onChange,
  preferredCategory,
  legacyText,
  disabled,
  className,
  placeholder = "Selecione um fornecedor...",
}: Props) {
  const { data: suppliers = [], isLoading } = useSuppliersQuery();
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => suppliers.find((s) => s.id === value) ?? null,
    [suppliers, value],
  );

  const sorted = useMemo(() => {
    const list = [...suppliers];
    if (preferredCategory) {
      list.sort((a, b) => {
        const ap = a.categories?.includes(preferredCategory) ? 0 : 1;
        const bp = b.categories?.includes(preferredCategory) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        if (a.is_global !== b.is_global) return a.is_global ? -1 : 1;
        return supplierLabel(a).localeCompare(supplierLabel(b), "pt-BR");
      });
    }
    return list;
  }, [suppliers, preferredCategory]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate flex items-center gap-2">
            {selected ? (
              <>
                <span className="truncate">{supplierLabel(selected)}</span>
                {selected.is_global && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                    <Globe2 className="h-2.5 w-2.5 mr-1" /> Global
                  </Badge>
                )}
              </>
            ) : legacyText ? (
              <span className="truncate italic">{legacyText}</span>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,90vw)] p-0" align="start">
        <Command
          filter={(v, search) => {
            const s = search
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");
            const t = v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return t.includes(s) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Buscar fornecedor..." />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Carregando..." : "Nenhum fornecedor encontrado."}
            </CommandEmpty>
            {value && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null, null);
                    setOpen(false);
                  }}
                >
                  Limpar seleção
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {sorted.map((s) => {
                const label = supplierLabel(s);
                const searchable = [label, s.legal_name, s.trade_name]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <CommandItem
                    key={s.id}
                    value={searchable}
                    onSelect={() => {
                      onChange(s.id, s);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        value === s.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate flex-1">{label}</span>
                    {s.is_global && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                        <Globe2 className="h-2.5 w-2.5 mr-1" /> Global
                      </Badge>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Normaliza um nome para matching fuzzy leve (sem acento, minúsculo, sem espaços extras). */
export function normalizeSupplierName(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}
