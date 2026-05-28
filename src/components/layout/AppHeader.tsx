import { Bell, Search, ChevronDown } from "lucide-react";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
}

export function AppHeader({ title, subtitle }: AppHeaderProps) {
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

          <button className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 border border-white/10 transition">
            <div className="h-7 w-7 rounded-full bg-brand-foreground text-brand grid place-items-center text-xs font-bold">
              RV
            </div>
            <span className="text-sm font-medium hidden sm:inline">Revendedor</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </button>
        </div>
      </div>
    </header>
  );
}
