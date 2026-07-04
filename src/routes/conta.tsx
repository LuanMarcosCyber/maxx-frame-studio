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
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getInitials } from "@/lib/avatar";
import { fmtCPF, fmtCNPJ, onlyDigits } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/conta")({
  head: () => ({ meta: [{ title: "Conta — Total Maxx ERP" }] }),
  component: Conta,
});

type DocType = "cpf" | "cnpj";

function Conta() {
  const { user, profile, role, loading: authLoading, refreshProfile } = useAuth();
  const isChildAccount = !!profile?.parent_user_id || profile?.account_type === "operacional" || role === "colaborador";
  const readOnly = isChildAccount;
  const initialLoading = authLoading || !profile;
  const [form, setForm] = useState({
    full_name: "",
    store_name: "",
    email: "",
    phone: "",
    document_type: "cnpj" as DocType,
    document: "",
    cep: "",
    address: "",
    address_number: "",
    city: "",
    state: "",
    avatar_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const source = profile as unknown as Record<string, string | null>;
    const dt = (source.document_type as DocType | null) ?? null;
    const inferred: DocType =
      dt ?? (onlyDigits(source.document ?? "").length === 11 ? "cpf" : "cnpj");
    setForm({
      full_name: source.full_name ?? "",
      store_name: source.store_name ?? "",
      email: source.email ?? "",
      phone: source.phone ?? "",
      document_type: inferred,
      document: source.document ?? "",
      cep: source.cep ?? "",
      address: source.address ?? "",
      address_number: source.address_number ?? "",
      city: source.city ?? "",
      state: source.state ?? "",
      avatar_url: source.avatar_url ?? "",
    });
  }, [profile]);



  const displayName = profile?.full_name || profile?.username || "";
  const username = profile?.username || "";
  const accountCardName = readOnly ? form.store_name || form.full_name || displayName : displayName;

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
        address: data.logradouro || f.address,
        city: data.localidade || f.city,
        state: data.uf || f.state,
      }));
    } catch {
      toast.error("Não foi possível buscar o CEP.");
    } finally {
      setCepLoading(false);
    }
  }

  const onDocBlur = () => {
    const formatted =
      form.document_type === "cpf"
        ? fmtCPF(form.document)
        : fmtCNPJ(form.document);
    if (formatted !== form.document) setForm((f) => ({ ...f, document: formatted }));
  };

  const onSave = async () => {
    if (!user) return;
    setSaving(true);
    const documentFormatted =
      form.document_type === "cpf"
        ? fmtCPF(form.document)
        : fmtCNPJ(form.document);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name || null,
        store_name: form.store_name || null,
        email: form.email || null,
        phone: form.phone || null,
        document_type: form.document_type,
        document: documentFormatted || null,
        cep: form.cep || null,
        address: form.address || null,
        address_number: form.address_number || null,
        city: form.city || null,
        state: form.state || null,
      })
      .eq("id", user.id);
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
    <AppShell title="Minha Conta" subtitle="Dados do usuário e perfil">
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-base font-semibold mb-1">Informações pessoais</h2>
          <p className="text-xs text-muted-foreground mb-6">
            {readOnly
              ? "Dados comerciais herdados da conta principal (somente leitura)."
              : "Atualize seus dados de cadastro"}
          </p>
          <div className="grid sm:grid-cols-6 gap-4">
            {initialLoading ? (
              <>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-1.5 sm:col-span-3">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </>
            ) : (
            <>
            <div className="space-y-1.5 sm:col-span-6">
              <Label htmlFor="nome">Nome completo</Label>
              <Input
                id="nome"
                value={form.full_name}
                onChange={onChange("full_name")}
                placeholder="Seu nome completo"
                readOnly={readOnly}
                disabled={readOnly}
                className={roCls}
              />
            </div>

            {!isChildAccount && (
              <div className="space-y-1.5 sm:col-span-6">
                <Label htmlFor="loja">Nome da loja</Label>
                <Input
                  id="loja"
                  value={form.store_name}
                  onChange={onChange("store_name")}
                  placeholder="Ex.: Molduraria Silva"
                  readOnly={readOnly}
                  disabled={readOnly}
                  className={roCls}
                />
              </div>
            )}


            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={onChange("email")}
                placeholder="seuemail@empresa.com"
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
                placeholder="(11) 99999-9999"
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
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, document_type: v as DocType }))
                  }
                  className="flex gap-3"
                >
                  <label className="flex items-center gap-2 cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-accent transition">
                    <RadioGroupItem value="cpf" id="dt-cpf" />
                    <span className="text-sm">CPF</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-accent transition">
                    <RadioGroupItem value="cnpj" id="dt-cnpj" />
                    <span className="text-sm">CNPJ</span>
                  </label>
                </RadioGroup>
              </div>
            )}

            <div className="space-y-1.5 sm:col-span-6">
              <Label htmlFor="doc">
                {form.document_type === "cpf" ? "CPF" : "CNPJ"}
              </Label>
              <Input
                id="doc"
                value={form.document}
                onChange={onChange("document")}
                onBlur={readOnly ? undefined : onDocBlur}
                placeholder={
                  form.document_type === "cpf"
                    ? "000.000.000-00"
                    : "00.000.000/0000-00"
                }
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
              <Label htmlFor="rua">Rua</Label>
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
              <StatRow
                icon={<FileText className="h-4 w-4" />}
                label="Orçamentos"
                value={stats?.budgets ?? 0}
              />
              <StatRow
                icon={<ShoppingCart className="h-4 w-4" />}
                label="Pedidos"
                value={stats?.orders ?? 0}
              />
              <StatRow
                icon={<Package className="h-4 w-4" />}
                label="Produtos"
                value={stats?.products ?? 0}
              />
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
