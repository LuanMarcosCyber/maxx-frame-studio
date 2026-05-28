import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Package,
  User,
  Settings,
  Frame,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Orçamentos", url: "/orcamentos", icon: FileText },
  { title: "Pedidos", url: "/pedidos", icon: ShoppingCart },
  { title: "Produtos", url: "/produtos", icon: Package },
];

const bottomItems = [
  { title: "Conta", url: "/conta", icon: User },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url);

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Logo */}
      <div className="h-20 flex items-center gap-3 px-6 border-b border-sidebar-border">
        <div className="h-10 w-10 rounded-lg bg-gradient-brand grid place-items-center shadow-brand">
          <Frame className="h-5 w-5 text-brand-foreground" />
        </div>
        <div className="leading-tight">
          <div className="text-base font-bold tracking-tight">Total Maxx</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/60">
            ERP Revendedor
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
          Principal
        </div>
        {items.map((item) => {
          const active = isActive(item.url);
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-brand"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}

        <div className="px-3 pt-6 pb-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
          Sistema
        </div>
        {bottomItems.map((item) => {
          const active = isActive(item.url);
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-brand"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 rounded-md bg-sidebar-accent/50 p-3">
          <div className="h-9 w-9 rounded-full bg-gradient-brand grid place-items-center text-sm font-semibold text-brand-foreground">
            RV
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Revendedor</div>
            <div className="text-[11px] text-sidebar-foreground/60">
              rev@totalmaxx.com
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
