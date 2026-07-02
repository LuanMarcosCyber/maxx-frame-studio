import { useState } from "react";
import { Bell, Search, ChevronDown, LogOut, Menu, Check, X, Eye } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getInitials } from "@/lib/avatar";
import { fmtPct } from "@/lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SidebarContents } from "./AppSidebar";
import { OperatorSwitcher } from "./OperatorSwitcher";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
}

type DiscountRequest = {
  id: string;
  budget_id: string | null;
  budget_number: string | null;
  requested_percent: number;
  status: string;
  created_at: string;
  requested_by: string;
};

export function AppHeader({ title, subtitle }: AppHeaderProps) {
  const { profile, role, session, signOut } = useAuth();
  const displayName = profile?.full_name || profile?.username || "Usuário";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const canSeeNotifications = role === "admin" || role === "revendedor";

  const { data: requests = [] } = useQuery({
    queryKey: ["discount-requests", "pending"],
    enabled: !!session && canSeeNotifications,
    refetchInterval: 30000,
    queryFn: async (): Promise<DiscountRequest[]> => {
      const { data, error } = await supabase
        .from("discount_approval_requests")
        .select("id, budget_id, budget_number, requested_percent, status, created_at, requested_by")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DiscountRequest[];
    },
  });

  const requesterIds = Array.from(new Set(requests.map((r) => r.requested_by)));
  const { data: namesMap = new Map<string, string>() } = useQuery({
    queryKey: ["profiles", "names", "notif", requesterIds],
    enabled: requesterIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", requesterIds);
      const m = new Map<string, string>();
      (data ?? []).forEach((p) => m.set(p.id, p.full_name || p.username || "Colaborador"));
      return m;
    },
  });

  async function decide(req: DiscountRequest, status: "approved" | "rejected") {
    const { error } = await supabase
      .from("discount_approval_requests")
      .update({
        status,
        decided_by: session?.user?.id,
        decided_at: new Date().toISOString(),
      })
      .eq("id", req.id);
    if (error) {
      toast.error("Falha ao atualizar solicitação.");
      return;
    }
    toast.success(status === "approved" ? "Desconto aprovado." : "Solicitação rejeitada.");
    qc.invalidateQueries({ queryKey: ["discount-requests"] });
  }

  function openBudget(req: DiscountRequest) {
    if (!req.budget_id) return;
    setNotifOpen(false);
    navigate({ to: "/orcamentos", search: { view: req.budget_id } });
  }

  const pendingCount = requests.length;

  return (
    <header className="bg-gradient-brand text-brand-foreground shadow-brand">
      <div className="flex items-center gap-3 sm:gap-6 px-4 sm:px-6 lg:px-10 h-16 sm:h-20">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Abrir menu"
              className="md:hidden h-10 w-10 grid place-items-center rounded-md bg-white/10 hover:bg-white/15 border border-white/10 transition shrink-0"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72 max-w-[85vw]">
            <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
            <SidebarContents onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold tracking-tight truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="hidden sm:block text-xs lg:text-sm text-brand-foreground/70 mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>

          <div className="hidden lg:flex items-center gap-2 bg-white/10 backdrop-blur rounded-md px-3 py-2 w-72 border border-white/10 shrink-0 ml-auto">
            <Search className="h-4 w-4 text-brand-foreground/70" />
            <input
              placeholder="Buscar no sistema..."
              className="bg-transparent text-sm placeholder:text-brand-foreground/50 focus:outline-none w-full"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0 border-l border-white/10 pl-3 sm:pl-4">
          {profile?.parent_user_id ? <OperatorSwitcher /> : null}
          <button
            type="button"
            aria-label="Notificações"
            onClick={() => canSeeNotifications && setNotifOpen(true)}
            className="relative h-10 w-10 grid place-items-center rounded-md bg-white/10 hover:bg-white/15 transition border border-white/10"
          >
            <Bell className="h-4 w-4" />
            {canSeeNotifications && pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 pl-2 pr-2 sm:pr-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 border border-white/10 transition outline-none">
              <div className="h-7 w-7 rounded-full bg-brand-foreground text-brand grid place-items-center text-xs font-bold">
                {getInitials(profile?.full_name || profile?.username)}
              </div>
              <span className="text-sm font-medium hidden sm:inline max-w-[140px] truncate">
                {displayName}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-70 hidden sm:inline" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="text-sm">{displayName}</span>
                {profile?.username && (
                  <span className="text-[11px] text-muted-foreground font-normal font-mono">
                    @{profile.username}
                  </span>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4 mr-2" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={notifOpen} onOpenChange={setNotifOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Solicitações de desconto</DialogTitle>
          </DialogHeader>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma solicitação pendente.
            </p>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {requests.map((r) => (
                <div key={r.id} className="rounded-lg border p-3 space-y-2">
                  <div className="text-sm">
                    <span className="font-semibold">
                      {namesMap.get(r.requested_by) || "Colaborador"}
                    </span>{" "}
                    solicitou aprovação para aplicar{" "}
                    <span className="font-semibold">
                      {Number(r.requested_percent).toFixed(2)}%
                    </span>{" "}
                    de desconto no orçamento{" "}
                    <span className="font-mono">{r.budget_number || "—"}</span>.
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => decide(r, "approved")}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => decide(r, "rejected")}
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> Rejeitar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openBudget(r)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Visualizar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </header>
  );
}
