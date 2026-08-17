import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Building2, Package, Search, Users, Clock } from "lucide-react";
import { getInitials } from "@/lib/avatar";
import { fmtDateTimeFull } from "@/lib/utils";
import {
  listCompaniesGrid,
  getCompanyAdvancedDetails,
} from "@/lib/company-insights.functions";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground break-words">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

export function AdvancedCompaniesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const fetchList = useServerFn(listCompaniesGrid);
  const fetchDetails = useServerFn(getCompanyAdvancedDetails);

  const listQuery = useQuery({
    queryKey: ["empresas-avancado", "lista"],
    queryFn: () => fetchList(),
    enabled: open,
    staleTime: 60_000,
  });

  const detailsQuery = useQuery({
    queryKey: ["empresas-avancado", "detalhes", selectedId],
    queryFn: () => fetchDetails({ data: { company_id: selectedId! } }),
    enabled: open && !!selectedId,
  });

  const companies = (listQuery.data ?? []).filter((c) => {
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return (
      c.name.toLowerCase().includes(term) ||
      (c.username ?? "").toLowerCase().includes(term)
    );
  });

  const d = detailsQuery.data;
  const p = d?.profile as Record<string, string | null> | undefined;

  function close(o: boolean) {
    onOpenChange(o);
    if (!o) {
      setSelectedId(null);
      setQ("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Building2 className="h-4 w-4" />
            {selectedId ? "Detalhes avançados da empresa" : "Empresas cadastradas"}
          </DialogTitle>
          <DialogDescription>
            {selectedId
              ? "Dados comerciais, usuários, produtos e último acesso."
              : "Selecione uma empresa para ver os detalhes avançados."}
          </DialogDescription>
        </DialogHeader>

        {!selectedId ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar empresa ou @usuário..."
                className="pl-9 h-9"
              />
            </div>

            {listQuery.isLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
            ) : companies.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhuma empresa encontrada.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {companies.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 hover:border-primary hover:bg-accent/50 transition-colors text-center"
                  >
                    <Avatar className="h-16 w-16">
                      {c.avatar_url ? <AvatarImage src={c.avatar_url} alt={c.name} /> : null}
                      <AvatarFallback>{getInitials(c.name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium leading-tight line-clamp-2">
                      {c.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      @{c.username ?? "—"}
                    </span>
                    {c.is_branch && (
                      <Badge variant="secondary" className="text-[10px]">
                        Filial
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : detailsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
        ) : detailsQuery.isError ? (
          <p className="text-sm text-destructive py-6 text-center">
            {(detailsQuery.error as Error)?.message ?? "Falha ao carregar."}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14">
                {p?.avatar_url ? <AvatarImage src={p.avatar_url} alt="" /> : null}
                <AvatarFallback>
                  {getInitials(p?.store_name || p?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-base font-semibold">
                  {p?.store_name || p?.full_name || "—"}
                </p>
                <p className="text-xs text-muted-foreground">@{p?.username ?? "—"}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="p-3 flex items-center gap-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-[11px] text-muted-foreground">Usuários</p>
                  <p className="text-lg font-semibold">{d?.users.length ?? 0}</p>
                </div>
              </Card>
              <Card className="p-3 flex items-center gap-3">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-[11px] text-muted-foreground">Produtos individuais</p>
                  <p className="text-lg font-semibold">{d?.productsCount ?? 0}</p>
                </div>
              </Card>
              <Card className="p-3 flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-[11px] text-muted-foreground">Último acesso</p>
                  <p className="text-sm font-semibold">
                    {d?.lastSignInAt ? fmtDateTime(d.lastSignInAt) : "Nunca acessou"}
                  </p>
                </div>
              </Card>
            </div>

            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">Dados comerciais</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Razão social" value={p?.legal_name} />
                <Field label="Nome fantasia" value={p?.store_name} />
                <Field label={p?.document_type || "CNPJ/CPF"} value={p?.document} />
                <Field label="Inscrição estadual" value={p?.state_registration} />
                <Field label="E-mail" value={p?.email} />
                <Field label="Telefone" value={p?.phone} />
                <Field label="WhatsApp" value={p?.whatsapp} />
                <Field label="CEP" value={p?.cep} />
                <Field label="Cidade / UF" value={[p?.city, p?.state].filter(Boolean).join(" / ")} />
                <Field
                  label="Endereço"
                  value={[p?.address, p?.address_number].filter(Boolean).join(", ")}
                />
                <Field label="Complemento" value={p?.complement} />
                <Field label="Bairro" value={p?.neighborhood} />
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">Usuários cadastrados</h3>
              {(d?.users.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {d!.users.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px]">
                          {getInitials(u.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{u.name}</span>
                      {u.is_owner && (
                        <Badge variant="secondary" className="text-[10px]">
                          Proprietário
                        </Badge>
                      )}
                      {!u.active && (
                        <Badge variant="outline" className="text-[10px]">
                          Inativo
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
