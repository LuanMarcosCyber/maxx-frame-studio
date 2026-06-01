import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
    email: "",
    phone: "",
    document: "",
    address: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      full_name: profile?.full_name ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      document: profile?.document ?? "",
      address: profile?.address ?? "",
    });
  }, [profile]);

  const displayName = profile?.full_name || profile?.username || "";
  const username = profile?.username || "";

  const onChange = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name || null,
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
          <h3 className="text-base font-semibold mb-1">Informações pessoais</h3>
          <p className="text-xs text-muted-foreground mb-6">
            Atualize seus dados de cadastro
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome completo</Label>
              <Input id="nome" value={form.full_name} onChange={onChange("full_name")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={form.email} onChange={onChange("email")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tel">Telefone</Label>
              <Input id="tel" value={form.phone} onChange={onChange("phone")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc">CNPJ / CPF</Label>
              <Input id="doc" value={form.document} onChange={onChange("document")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="end">Endereço</Label>
              <Input id="end" value={form.address} onChange={onChange("address")} />
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
      </div>
    </AppShell>
  );
}
