import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Total Maxx ERP" }] }),
  component: Configuracoes,
});

const toggles = [
  ["Notificações por e-mail", "Receba atualizações de orçamentos e pedidos"],
  ["Alerta de novos pedidos", "Sinal sonoro ao criar um novo pedido"],
  ["Backup automático", "Sincronize seus dados diariamente"],
];

function Configuracoes() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  return (
    <AppShell title="Configurações" subtitle="Ajustes do sistema e preferências">
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-base font-semibold mb-1">Preferências</h3>
          <p className="text-xs text-muted-foreground mb-5">
            Personalize o comportamento do sistema
          </p>
          <ul className="divide-y divide-border">
            {toggles.map(([t, d]) => (
              <li
                key={t}
                className="py-4 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="text-sm font-medium">{t}</div>
                  <div className="text-xs text-muted-foreground">{d}</div>
                </div>
                <Switch />
              </li>
            ))}
          </ul>
        </Card>

        {isAdmin && (
          <Card className="p-6 lg:col-span-2">
            <h3 className="text-base font-semibold mb-1">Perfis de acesso</h3>
            <p className="text-xs text-muted-foreground mb-5">
              Controle de permissões — administrado pelo ADMIN
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">ADMIN</div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
                    Total
                  </span>
                </div>
                <ul className="mt-3 text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
                  <li>Visualiza todos os usuários</li>
                  <li>Visualiza todos os produtos</li>
                  <li>Visualiza todos os orçamentos</li>
                  <li>Cria novos usuários</li>
                </ul>
              </div>
              <div className="p-5 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">REVENDEDOR</div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium">
                    Restrito
                  </span>
                </div>
                <ul className="mt-3 text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
                  <li>Visualiza apenas seus próprios dados</li>
                  <li>Cadastra produtos próprios</li>
                  <li>Cria orçamentos próprios</li>
                </ul>
              </div>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
