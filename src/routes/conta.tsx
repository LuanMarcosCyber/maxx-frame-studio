import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/conta")({
  head: () => ({ meta: [{ title: "Conta — Total Maxx ERP" }] }),
  component: Conta,
});

function Conta() {
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
              <Input id="nome" defaultValue="Revendedor Total Maxx" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" defaultValue="rev@totalmaxx.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tel">Telefone</Label>
              <Input id="tel" placeholder="(00) 00000-0000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc">CNPJ / CPF</Label>
              <Input id="doc" placeholder="00.000.000/0000-00" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="end">Endereço</Label>
              <Input id="end" placeholder="Rua, número, cidade, UF" />
            </div>
          </div>
          <div className="flex justify-end mt-6">
            <Button className="bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand">
              Salvar alterações
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex flex-col items-center text-center">
            <div className="h-20 w-20 rounded-full bg-gradient-brand grid place-items-center text-brand-foreground text-2xl font-bold shadow-brand">
              RV
            </div>
            <div className="mt-4 font-semibold">Revendedor Total Maxx</div>
            <div className="text-xs text-muted-foreground">rev@totalmaxx.com</div>
            <span className="mt-3 text-[11px] px-2.5 py-0.5 rounded-full bg-accent text-accent-foreground font-medium uppercase tracking-wider">
              Perfil: Revendedor
            </span>
          </div>
          <div className="mt-6 pt-6 border-t border-border space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Orçamentos</span>
              <span className="font-semibold">24</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pedidos</span>
              <span className="font-semibold">8</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Produtos</span>
              <span className="font-semibold">36</span>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
