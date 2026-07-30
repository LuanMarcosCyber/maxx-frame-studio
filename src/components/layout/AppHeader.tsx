import { useState } from "react";
import { Menu, UserCircle2, LogOut, RefreshCw, ChevronDown } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useOperator } from "@/hooks/useOperator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { SidebarContents } from "./AppSidebar";
import { OperatorSwitcher } from "./OperatorSwitcher";


interface AppHeaderProps {
  title: string;
  subtitle?: string;
}

export function AppHeader({ title, subtitle }: AppHeaderProps) {
  const { profile, signOut } = useAuth();
  const { activeOperator, clearActiveOperator } = useOperator();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const navigate = useNavigate();


  const companyLabel = profile?.store_name || profile?.full_name || "Empresa";
  const userLabel = activeOperator?.full_name || profile?.full_name || "Usuário";
  // O primeiro nome nunca some, mesmo em telas estreitas ou com nomes longos.
  const userFirstName = userLabel.trim().split(/\s+/)[0] || userLabel;

  async function handleSwitchUser() {
    // Abre o modal centralizado sem limpar o usuário ativo — evita cair na
    // tela cheia "Quem está usando?" enquanto o usuário escolhe outro.
    setSwitchOpen(true);
  }


  async function handleLeaveCompany() {
    clearActiveOperator();
    await signOut();
    navigate({ to: "/login", replace: true });
  }


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

        </div>


        <div className="flex items-center gap-2 sm:gap-3 shrink-0 border-l border-white/10 pl-3 sm:pl-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/15 border border-white/10 transition text-xs sm:text-sm max-w-[280px]"
                title="Sessão"
              >
                <UserCircle2 className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  <span className="opacity-70">{companyLabel}</span>
                  <span className="opacity-50"> — </span>
                  <span className="font-medium">Usuário: {userLabel}</span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                <div className="font-semibold text-foreground truncate">{companyLabel}</div>
                <div className="truncate">Usuário: {userLabel}</div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSwitchUser}>
                <RefreshCw className="h-4 w-4 mr-2" /> Trocar usuário
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLeaveCompany} className="text-red-600">
                <LogOut className="h-4 w-4 mr-2" /> Sair da empresa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <OperatorSwitcher open={switchOpen} onOpenChange={setSwitchOpen} hideTrigger />
        </div>

      </div>

    </header>
  );
}
