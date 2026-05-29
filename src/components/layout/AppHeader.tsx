import { Bell, Search, ChevronDown, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
}

function initials(name?: string | null, email?: string | null) {
  const src = name?.trim() || email?.split("@")[0] || "U";
  return src
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function AppHeader({ title, subtitle }: AppHeaderProps) {
  const { user, profile, role, signOut } = useAuth();
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Usuário";

  return (
    <header className="bg-gradient-brand text-brand-foreground shadow-brand">
      <div className="flex items-center justify-between gap-6 px-6 lg:px-10 h-20">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-xs lg:text-sm text-brand-foreground/70 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 bg-white/10 backdrop-blur rounded-md px-3 py-2 w-72 border border-white/10">
            <Search className="h-4 w-4 text-brand-foreground/70" />
            <input
              placeholder="Buscar no sistema..."
              className="bg-transparent text-sm placeholder:text-brand-foreground/50 focus:outline-none w-full"
            />
          </div>

          <button className="relative h-10 w-10 grid place-items-center rounded-md bg-white/10 hover:bg-white/15 transition border border-white/10">
            <Bell className="h-4 w-4" />
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-amber-300" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 border border-white/10 transition outline-none">
              <div className="h-7 w-7 rounded-full bg-brand-foreground text-brand grid place-items-center text-xs font-bold">
                {initials(profile?.full_name, user?.email)}
              </div>
              <span className="text-sm font-medium hidden sm:inline">{displayName}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="text-sm">{displayName}</span>
                <span className="text-[11px] text-muted-foreground font-normal">
                  {user?.email}
                </span>
                {role && (
                  <span className="text-[10px] uppercase tracking-wider text-primary font-semibold mt-1">
                    {role}
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
