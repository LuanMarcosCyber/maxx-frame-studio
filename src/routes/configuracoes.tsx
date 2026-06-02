import { createFileRoute } from "@tanstack/react-router";
import { Sun, Moon, Monitor } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useTheme, type ThemeMode } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Total Maxx ERP" }] }),
  component: Configuracoes,
});

const toggles = [
  ["Notificações por e-mail", "Receba atualizações de orçamentos e pedidos"],
  ["Alerta de novos pedidos", "Sinal sonoro ao criar um novo pedido"],
  ["Backup automático", "Sincronize seus dados diariamente"],
];

const themeOptions: { value: ThemeMode; label: string; description: string; icon: typeof Sun }[] = [
  { value: "system", label: "Automático", description: "Segue o sistema operacional", icon: Monitor },
  { value: "light", label: "Claro", description: "Tema claro padrão", icon: Sun },
  { value: "dark", label: "Escuro", description: "Tema escuro para baixa luz", icon: Moon },
];

function Configuracoes() {
  const { role } = useAuth();
  const { theme, setTheme } = useTheme();
  const isAdmin = role === "admin";

  return (
    <AppShell title="Configurações" subtitle="Ajustes do sistema e preferências">
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-base font-semibold mb-1">Aparência</h3>
          <p className="text-xs text-muted-foreground mb-5">
            Escolha como o sistema deve ser exibido
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            {themeOptions.map((opt) => {
              const active = theme === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTheme(opt.value)}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all",
                    active
                      ? "border-primary bg-primary/5 shadow-brand"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <div
                    className={cn(
                      "h-9 w-9 grid place-items-center rounded-md",
                      active ? "bg-gradient-brand text-brand-foreground" : "bg-muted text-foreground/70",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.description}</div>
                </button>
              );
            })}
          </div>
        </Card>

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
