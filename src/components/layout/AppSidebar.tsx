import { Link, useRouterState } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Package,
  User,
  Settings,
  Users,
  UserCog,
  Contact,
  BarChart3,
  Pencil,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials, fileToAvatarDataUrl } from "@/lib/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Item = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  badge?: string;
};

const dashboard: Item = { title: "Dashboard", url: "/", icon: LayoutDashboard };
const orcamentos: Item = { title: "Orçamentos", url: "/orcamentos", icon: FileText };
const pedidos: Item = { title: "Pedidos", url: "/pedidos", icon: ShoppingCart };
const clientes: Item = { title: "Clientes", url: "/clientes", icon: Contact };
const produtos: Item = { title: "Produtos", url: "/produtos", icon: Package };
const relatorios: Item = { title: "Relatórios", url: "/relatorios", icon: BarChart3, badge: "Em breve" };
const revendedores: Item = { title: "Revendedores", url: "/revendedores", icon: Users };
const colaboradores: Item = { title: "Colaboradores", url: "/colaboradores", icon: UserCog };

const conta: Item = { title: "Conta", url: "/conta", icon: User };
const configuracoes: Item = { title: "Configurações", url: "/configuracoes", icon: Settings };

const sidebarBg = "#F8F9FB";

function useSidebarData() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { role, profile } = useAuth();

  let items: Item[];
  let bottomItems: Item[];
  if (role === "admin") {
    items = [dashboard, orcamentos, pedidos, clientes, produtos, relatorios, revendedores, colaboradores];
    bottomItems = [conta, configuracoes];
  } else if (role === "colaborador") {
    items = [dashboard, orcamentos, pedidos, clientes, produtos];
    bottomItems = [conta];
  } else {
    items = [dashboard, orcamentos, pedidos, clientes, produtos, relatorios, colaboradores];
    bottomItems = [conta, configuracoes];
  }

  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url);

  return { items, bottomItems, isActive, profile };
}

function ProfileAvatar() {
  const { user, profile, refreshProfile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onPick = () => inputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 5 MB).");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file, 320, 0.85);
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: dataUrl })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Foto de perfil atualizada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar foto.");
    } finally {
      setUploading(false);
    }
  };

  const avatar = profile?.avatar_url;
  const name = profile?.full_name || profile?.username || "";

  return (
    <div className="relative">
      <div
        className="h-28 w-28 rounded-full overflow-hidden bg-muted border-2 border-white shadow-md grid place-items-center"
        aria-label="Foto de perfil"
      >
        {avatar ? (
          <img src={avatar} alt={name || "Foto de perfil"} className="h-full w-full object-cover" />
        ) : (
          <User className="h-12 w-12 text-muted-foreground/60" strokeWidth={1.5} />
        )}
      </div>
      <button
        type="button"
        onClick={onPick}
        disabled={uploading}
        aria-label="Alterar foto de perfil"
        className={cn(
          "absolute bottom-0 right-0 h-9 w-9 rounded-full grid place-items-center",
          "bg-gradient-brand text-brand-foreground shadow-brand border-2 border-white",
          "hover:opacity-95 transition disabled:opacity-60",
        )}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Pencil className="h-4 w-4" />
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
    </div>
  );
}

export function SidebarContents({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { items, bottomItems, isActive } = useSidebarData();
  const { profile } = useAuth();

  const renderLink = (item: Item) => {
    const active = isActive(item.url);
    return (
      <Link
        key={item.url}
        to={item.url}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all",
          active
            ? "bg-gradient-brand text-brand-foreground shadow-brand"
            : "text-foreground/75 hover:bg-accent hover:text-foreground",
        )}
      >
        <item.icon className="h-4 w-4" />
        <span className="flex-1">{item.title}</span>
        {item.badge && (
          <span
            className={cn(
              "text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full",
              active
                ? "bg-white/20 text-brand-foreground"
                : "bg-amber-100 text-amber-700",
            )}
          >
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: sidebarBg }}>
      <div
        className="flex items-center justify-center px-6 py-6"
        style={{ minHeight: "176px", backgroundColor: sidebarBg }}
      >
        <ProfileAvatar />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Principal
        </div>
        {items.map(renderLink)}

        <div className="px-3 pt-6 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sistema
        </div>
        {bottomItems.map(renderLink)}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 rounded-md bg-card border border-border p-3">
          <div className="h-9 w-9 shrink-0 rounded-full overflow-hidden bg-gradient-brand grid place-items-center text-sm font-semibold text-brand-foreground uppercase">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile?.full_name || "Usuário"}
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials(profile?.full_name || profile?.username)
            )}
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
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside
      className="hidden md:flex w-64 shrink-0 flex-col border-r border-border shadow-[2px_0_8px_-4px_rgba(15,23,42,0.08)] sticky top-0 h-screen"
      style={{ backgroundColor: sidebarBg }}
    >
      <SidebarContents />
    </aside>
  );
}
