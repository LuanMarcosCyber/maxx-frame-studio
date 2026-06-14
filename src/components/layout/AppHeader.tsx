import { useState } from "react";
import { Bell, Search, ChevronDown, LogOut, Menu } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getInitials } from "@/lib/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { SidebarContents } from "./AppSidebar";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
}

export function AppHeader({ title, subtitle }: AppHeaderProps) {
  const { profile, signOut } = useAuth();
  const displayName = profile?.full_name || profile?.username || "Usuário";
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="bg-gradient-brand text-brand-foreground shadow-brand">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:gap-6 px-4 sm:px-6 lg:px-10 h-16 sm:h-20">
        {/* Mobile menu */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Abrir menu"
              className="md:hidden h-10 w-10 grid place-items-center rounded-md bg-white/10 hover:bg-white/15 border border-white/10 transition"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72 max-w-[85vw]">
            <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
            <SidebarContents onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

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

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden lg:flex items-center gap-2 bg-white/10 backdrop-blur rounded-md px-3 py-2 w-72 border border-white/10">
            <Search className="h-4 w-4 text-brand-foreground/70" />
            <input
              placeholder="Buscar no sistema..."
              className="bg-transparent text-sm placeholder:text-brand-foreground/50 focus:outline-none w-full"
            />
          </div>

          <button
            type="button"
            aria-label="Notificações"
            className="relative h-10 w-10 grid place-items-center rounded-md bg-white/10 hover:bg-white/15 transition border border-white/10"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-amber-300" />
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
    </header>
  );
}
