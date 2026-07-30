import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { actionLabel } from "@/lib/activity-log";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico do Sistema | TotalMaxx" },
      {
        name: "description",
        content:
          "Linha do tempo com todas as ações realizadas na empresa: orçamentos, pedidos, clientes, produtos e usuários.",
      },
      { property: "og:title", content: "Histórico do Sistema | TotalMaxx" },
      {
        property: "og:description",
        content: "Acompanhe tudo o que acontece dentro da sua empresa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <PermissionGuard permission="history">
      <HistoricoPage />
    </PermissionGuard>
  ),
});

type LogRow = {
  id: string;
  created_at: string;
  action: string;
  description: string | null;
  entity: string | null;
  entity_id: string | null;
  user_name: string | null;
};

const PERIODS = [
  { value: "all", label: "Todo o período" },
  { value: "today", label: "Hoje" },
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
];

function HistoricoPage() {
  const [search, setSearch] = useState("");
  const [user, setUser] = useState("all");
  const [action, setAction] = useState("all");
  const [period, setPeriod] = useState("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["activity-logs"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("list_activity_logs", {
        _limit: 500,
        _offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const users = useMemo(
    () => Array.from(new Set(rows.map((r) => r.user_name || "Sistema"))).sort(),
    [rows],
  );
  const actions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.action))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    return rows.filter((r) => {
      if (user !== "all" && (r.user_name || "Sistema") !== user) return false;
      if (action !== "all" && r.action !== action) return false;
      if (period !== "all") {
        const t = new Date(r.created_at);
        if (period === "today") {
          const d = new Date();
          if (t.toDateString() !== d.toDateString()) return false;
        } else {
          const days = Number(period);
          if (now - t.getTime() > days * 86400000) return false;
        }
      }
      if (q) {
        const hay = `${r.description ?? ""} ${actionLabel(r.action)} ${r.user_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, user, action, period]);

  return (
    <AppShell
      title="Histórico do Sistema"
      subtitle="Tudo o que acontece na empresa, do mais recente para o mais antigo"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Pesquisar</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar no histórico..."
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Usuário</Label>
            <Select value={user} onValueChange={setUser}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os usuários</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de ação</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                {actions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {actionLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Período</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4" />
            Linha do tempo
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {filtered.length} registro{filtered.length === 1 ? "" : "s"}
            </span>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Carregando histórico...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum registro encontrado.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((r) => {
                const d = new Date(r.created_at);
                return (
                  <li key={r.id} className="px-4 py-3 flex gap-3 items-start">
                    <div className="w-28 shrink-0 text-xs text-muted-foreground leading-tight">
                      <div>{d.toLocaleDateString("pt-BR")}</div>
                      <div>
                        {d.toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          {r.user_name || "Sistema"}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full bg-accent text-foreground/70">
                          {actionLabel(r.action)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 break-words">
                        {r.description || actionLabel(r.action)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
