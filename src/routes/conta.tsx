import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, ShoppingCart, Package } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getInitials } from "@/lib/avatar";
import { toast } from "sonner";

export const Route = createFileRoute("/conta")({
  head: () => ({ meta: [{ title: "Conta — Total Maxx ERP" }] }),
  component: Conta,
});

function Conta() {
  const { user, profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    full_name: "",
    store_name: "",
    email: "",
    phone: "",
    document: "",
    address: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      full_name: profile?.full_name ?? "",
      store_name: profile?.store_name ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      document: profile?.document ?? "",
      address: profile?.address ?? "",
    });
  }, [profile]);

  const displayName = profile?.full_name || profile?.username || "";
  const username = profile?.username || "";

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

  const onChange = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name || null,
        store_name: form.store_name || null,
        email: form.email || null,
        phone: form.phone || null,
        document: form.document || null,
        address: form.address || null,
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


  return (
    <AppShell title="Minha Conta" subtitle="Dados do usuário e perfil">
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-base font-semibold mb-1">Informações pessoais</h2>
          <p className="text-xs text-muted-foreground mb-6">
            Atualize seus dados de cadastro
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome completo</Label>
              <Input
                id="nome"
                value={form.full_name}
                onChange={onChange("full_name")}
                placeholder="Seu nome completo"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loja">Nome da loja</Label>
              <Input
                id="loja"
                value={form.store_name}
                onChange={onChange("store_name")}
                placeholder="Ex.: Molduraria Silva"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={onChange("email")}
                placeholder="seuemail@empresa.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tel">Telefone</Label>
              <Input
                id="tel"
                value={form.phone}
                onChange={onChange("phone")}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc">CNPJ / CPF</Label>
              <Input
                id="doc"
                value={form.document}
                onChange={onChange("document")}
                placeholder="Digite seu CPF ou CNPJ"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="end">Endereço</Label>
              <Input
                id="end"
                value={form.address}
                onChange={onChange("address")}
                placeholder="Rua, número, cidade - UF"
              />
            </div>
          </div>
          <div className="flex justify-end mt-6">
            <Button
              onClick={onSave}
              disabled={saving}
              className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="h-20 w-20 rounded-full bg-gradient-brand grid place-items-center text-brand-foreground text-2xl font-bold shadow-brand">
                {getInitials(displayName || username)}
              </div>
              {displayName && <div className="mt-4 font-semibold">{displayName}</div>}
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
