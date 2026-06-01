import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Package,
  User,
  Settings,
  Users,
} from "lucide-react";
import logoTotalMaxx from "@/assets/totalmaxx-logo.png";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/avatar";
import { useAuth } from "@/hooks/useAuth";

const baseItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Orçamentos", url: "/orcamentos", icon: FileText },
  { title: "Pedidos", url: "/pedidos", icon: ShoppingCart },
  { title: "Produtos", url: "/produtos", icon: Package },
];

const adminItems = [{ title: "Revendedores", url: "/revendedores", icon: Users }];

const bottomItems = [
  { title: "Conta", url: "/conta", icon: User },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { role, profile } = useAuth();
  const items = role === "admin" ? [...baseItems, ...adminItems] : baseItems;
  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url);

  return (
    <aside
      className="hidden md:flex w-64 shrink-0 flex-col border-r border-border shadow-[2px_0_8px_-4px_rgba(15,23,42,0.08)] sticky top-0 h-screen"
      style={{ backgroundColor: "#F8F9FB" }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-center px-6 py-6"
        style={{ minHeight: "160px", backgroundColor: "#F8F9FB" }}
      >
        <img
          src={logoTotalMaxx}
          alt="Total Maxx Import & Export"
          className="max-h-32 w-auto object-contain"
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                  ? "bg-gradient-brand text-brand-foreground shadow-brand"
                  : "text-foreground/75 hover:bg-accent hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}

        <div className="px-3 pt-6 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                  ? "bg-gradient-brand text-brand-foreground shadow-brand"
                  : "text-foreground/75 hover:bg-accent hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 rounded-md bg-white border border-border p-3">
          <div className="h-9 w-9 rounded-full bg-gradient-brand grid place-items-center text-sm font-semibold text-brand-foreground uppercase">
            {getInitials(profile?.full_name || profile?.username)}
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-sm font-semibold truncate text-foreground">
              {profile?.full_name || profile?.username || "Usuário"}
            </div>
            {profile?.username && (
              <div className="text-[11px] text-muted-foreground font-mono truncate">
                @{profile.username}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
