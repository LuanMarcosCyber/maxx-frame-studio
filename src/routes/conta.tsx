import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, ShoppingCart, Package, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/hooks/useAuth";
import { useOperator } from "@/hooks/useOperator";
import { supabase } from "@/integrations/supabase/client";
import { getInitials } from "@/lib/avatar";
import { fmtCPF, fmtCNPJ, onlyDigits } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/conta")({
  head: () => ({ meta: [{ title: "Conta — Total Maxx ERP" }] }),
  component: Conta,
});

type DocType = "CPF" | "CNPJ";

const upper = (v: string) => v.toUpperCase();

function Conta() {
  const { user, profile, role, refreshProfile } = useAuth();
  const { activeOperator } = useOperator();
  // Somente o proprietário da empresa (login raiz) ou admin editam.
  // Contas de acesso legadas (com parent_user_id) permanecem read-only.
  const isChildAccount = !!profile?.parent_user_id || profile?.account_type === "operacional" || role === "colaborador";
  const isOwnerOperator =
    (activeOperator?.username ?? "").trim().toLowerCase() === "proprietário" ||
    (activeOperator?.username ?? "").trim().toLowerCase() === "proprietario";
  const canEdit = !isChildAccount && (role === "admin" || !activeOperator || isOwnerOperator);
  const readOnly = !canEdit;

  const [form, setForm] = useState({
    full_name: "",
    store_name: "",
    legal_name: "",
    state_registration: "",
    email: "",
    phone: "",
    whatsapp: "",
    document_type: "CNPJ" as DocType,
    document: "",
    cep: "",
    address: "",
    address_number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    avatar_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  useEffect(() => {
    const p = (profile ?? {}) as Record<string, string | null> | null;
    if (!p) return;
    const dtRaw = (p.document_type ?? "").toString().toUpperCase();
    const inferred: DocType =
      dtRaw === "CPF" || dtRaw === "CNPJ"
        ? (dtRaw as DocType)
        : onlyDigits(p.document ?? "").length === 11
          ? "CPF"
          : "CNPJ";
    setForm({
      full_name: p.full_name ?? "",
      store_name: p.store_name ?? "",
      legal_name: p.legal_name ?? "",
      state_registration: p.state_registration ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
      whatsapp: p.whatsapp ?? "",
      document_type: inferred,
      document: p.document ?? "",
      cep: p.cep ?? "",
      address: p.address ?? "",
      address_number: p.address_number ?? "",
      complement: p.complement ?? "",
      neighborhood: p.neighborhood ?? "",
      city: p.city ?? "",
      state: p.state ?? "",
      avatar_url: p.avatar_url ?? "",
    });
  }, [profile]);

  const displayName = profile?.full_name || profile?.username || "";
  const username = profile?.username || "";
  const accountCardName = displayName;

  const { data: stats } = useQuery({
    queryKey: ["conta", "stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [b, o, p] = await Promise.all([
        supabase.from("budgets").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }),
      ]);
      return {
        budgets: b.count ?? 0,
        orders: o.count ?? 0,
        products: p.count ?? 0,
      };
    },
  });

  const onChange =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const onChangeUpper =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: upper(e.target.value) }));

  async function lookupCep(rawCep: string) {
    const cep = onlyDigits(rawCep);
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data?.erro) {
        toast.warning("CEP não encontrado.");
        return;
      }
      setForm((f) => ({
        ...f,
        address: upper(data.logradouro || f.address),
        neighborhood: upper(data.bairro || f.neighborhood),
        city: upper(data.localidade || f.city),
        state: upper(data.uf || f.state),
      }));
    } catch {
      toast.error("Não foi possível buscar o CEP.");
    } finally {
      setCepLoading(false);
    }
  }

  const onDocBlur = () => {
    const formatted =
      form.document_type === "CPF" ? fmtCPF(form.document) : fmtCNPJ(form.document);
    if (formatted !== form.document) setForm((f) => ({ ...f, document: formatted }));
  };

  const onSave = async () => {
    if (!user || readOnly) return;
    setSaving(true);
    const documentFormatted =
      form.document_type === "CPF" ? fmtCPF(form.document) : fmtCNPJ(form.document);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)("update_active_company_commercial", {
      _data: {
        full_name: form.full_name || null,
        store_name: upper(form.store_name || "") || null,
        legal_name: upper(form.legal_name || "") || null,
        state_registration: form.state_registration || null,
        email: form.email || null,
        phone: form.phone || null,
        whatsapp: form.whatsapp || null,
        document_type: form.document_type,
        document: documentFormatted || null,
        cep: form.cep || null,
        address: form.address || null,
        address_number: form.address_number || null,
        complement: form.complement || null,
        neighborhood: form.neighborhood || null,
        city: form.city || null,
        state: form.state || null,
      },
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    await refreshProfile();
    toast.success("Dados atualizados com sucesso");
  };

  const roCls = readOnly ? "cursor-not-allowed opacity-70 bg-muted/40" : "";

  return (
    <AppShell title="Minha Conta" subtitle="Dados da empresa e do proprietário">
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-base font-semibold mb-1">Dados comerciais da empresa</h2>
          <p className="text-xs text-muted-foreground mb-6">
            {readOnly
              ? "Somente o proprietário da empresa pode editar estes dados."
              : "Atualize os dados comerciais desta empresa."}
          </p>
          <div className="grid sm:grid-cols-6 gap-4">
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="nome">Nome do proprietário</Label>
              <Input
                id="nome"
                value={form.full_name}
                onChange={onChangeUpper("full_name")}
                placeholder="Nome completo"
                readOnly={readOnly}
                disabled={readOnly}
                className={roCls}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="loja">Nome da loja (fantasia)</Label>
              <Input
                id="loja"
                value={form.store_name}
                onChange={onChangeUpper("store_name")}
                placeholder="Ex.: KAU MOLDURAS"
                readOnly={readOnly}
                disabled={readOnly}
                className={roCls}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-4">
              <Label htmlFor="razao">Razão social</Label>
              <Input
                id="razao"
                value={form.legal_name}
                onChange={onChangeUpper("legal_name")}
                placeholder="KAU MOLDURAS LTDA"
                readOnly={readOnly}
                disabled={readOnly}
                className={roCls}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ie">Inscrição estadual</Label>
              <Input
                id="ie"
                value={form.state_registration}
                onChange={onChange("state_registration")}
                placeholder="Isento ou número"
                readOnly={readOnly}
                disabled={readOnly}
                className={roCls}
              />
            </div>

            {!readOnly && (
              <div className="space-y-1.5 sm:col-span-6">
                <Label>Tipo de documento</Label>
                <RadioGroup
                  value={form.document_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, document_type: v as DocType }))}
                  className="flex gap-3"
                >
                  <label className="flex items-center gap-2 cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-accent transition">
                    <RadioGroupItem value="CPF" id="dt-cpf" />
                    <span className="text-sm">CPF</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-accent transition">
                    <RadioGroupItem value="CNPJ" id="dt-cnpj" />
                    <span className="text-sm">CNPJ</span>
                  </label>
                </RadioGroup>
              </div>
            )}

            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="doc">{form.document_type === "CPF" ? "CPF" : "CNPJ"}</Label>
              <Input
                id="doc"
                value={form.document}
                onChange={onChange("document")}
                onBlur={readOnly ? undefined : onDocBlur}
                placeholder={form.document_type === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"}
                readOnly={readOnly}
                disabled={readOnly}
                className={roCls}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={onChange("email")}
                placeholder="empresa@dominio.com"
                readOnly={readOnly}
                disabled={readOnly}
                className={roCls}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="tel">Telefone</Label>
              <Input
                id="tel"
                value={form.phone}
                onChange={onChange("phone")}
                placeholder="(11) 3333-3333"
                readOnly={readOnly}
                disabled={readOnly}
                className={roCls}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="wpp">WhatsApp</Label>
              <Input
                id="wpp"
                value={form.whatsapp}
                onChange={onChange("whatsapp")}
                placeholder="(11) 99999-9999"
                readOnly={readOnly}
                disabled={readOnly}
                className={roCls}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cep">CEP</Label>
              <div className="relative">
                <Input
                  id="cep"
                  value={form.cep}
                  onChange={onChange("cep")}
                  onBlur={readOnly ? undefined : (e) => lookupCep(e.target.value)}
                  placeholder="00000-000"
                  readOnly={readOnly}
                  disabled={readOnly}
                  className={roCls}
                />
                {cepLoading && (
                  <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="rua">Logradouro</Label>
              <Input
                id="rua"
                value={form.address}
                onChange={onChange("address")}
                placeholder="Rua/Avenida"
                readOnly={readOnly}
                disabled={readOnly}
                className={roCls}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="num">Número</Label>
              <Input
                id="num"
                value={form.address_number}
                onChange={onChange("address_number")}
                placeholder="123"
                readOnly={readOnly}
                disabled={readOnly}
                className={roCls}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="comp">Complemento</Label>
              <Input
                id="comp"
                value={form.complement}
                onChange={onChange("complement")}
                placeholder="Sala, andar, etc."
                readOnly={readOnly}
                disabled={readOnly}
                className={roCls}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="bairro">Bairro</Label>
              <Input
                id="bairro"
                value={form.neighborhood}
                onChange={onChange("neighborhood")}
                placeholder="Bairro"
                readOnly={readOnly}
                disabled={readOnly}
                className={roCls}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-4">
              <Label htmlFor="cidade">Cidade</Label>
              <Input
                id="cidade"
                value={form.city}
                onChange={onChange("city")}
                placeholder="Cidade"
                readOnly={readOnly}
                disabled={readOnly}
                className={roCls}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="uf">UF</Label>
              <Input
                id="uf"
                value={form.state}
                onChange={(e) =>
                  setForm((f) => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))
                }
                placeholder="SP"
                maxLength={2}
                readOnly={readOnly}
                disabled={readOnly}
                className={roCls}
              />
            </div>
          </div>

          {!readOnly && (
            <div className="flex justify-end mt-6">
              <Button
                onClick={onSave}
                disabled={saving}
                className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
              >
                {saving ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="h-20 w-20 rounded-full bg-gradient-brand grid place-items-center text-brand-foreground text-2xl font-bold shadow-brand">
                {form.avatar_url ? (
                  <img src={form.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  getInitials(accountCardName || username)
                )}
              </div>
              {accountCardName && <div className="mt-4 font-semibold">{accountCardName}</div>}
              {username && (
                <div className="text-xs text-muted-foreground font-mono">@{username}</div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-sm font-semibold mb-4">Minhas estatísticas</h2>
            <div className="space-y-3">
              <StatRow icon={<FileText className="h-4 w-4" />} label="Orçamentos" value={stats?.budgets ?? 0} />
              <StatRow icon={<ShoppingCart className="h-4 w-4" />} label="Pedidos" value={stats?.orders ?? 0} />
              <StatRow icon={<Package className="h-4 w-4" />} label="Produtos" value={stats?.products ?? 0} />
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm text-foreground/80">
        <span className="h-7 w-7 grid place-items-center rounded-md bg-gradient-brand text-brand-foreground">
          {icon}
        </span>
        {label}
      </div>
      <span className="text-base font-semibold tabular-nums">{value}</span>
    </div>
  );
}
