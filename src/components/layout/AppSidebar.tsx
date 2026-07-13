import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  FolderPlus,
  ChevronDown,
  ChevronUp,
  Truck,
  Compass,
  UsersRound,
  LogOut,
  Building2,
  Trash2,

} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { getInitials, fileToAvatarDataUrl } from "@/lib/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listSwitchableCompanies,
  clearActiveCompany,
} from "@/lib/company-switch.functions";
import { useCompanySwitch } from "@/components/layout/CompanySwitchOverlay";


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
const fornecedores: Item = { title: "Fornecedores", url: "/fornecedores", icon: Building2 };
const arquitetos: Item = { title: "Arquitetos", url: "/arquitetos", icon: Compass };
const transportadoras: Item = { title: "Transportadoras", url: "/transportadoras", icon: Truck };
const relatorios: Item = { title: "Relatórios", url: "/relatorios", icon: BarChart3 };
const revendedores: Item = { title: "Empresas", url: "/revendedores", icon: Users };
const colaboradores: Item = { title: "Usuários/Contas", url: "/colaboradores", icon: UserCog };
const operadores: Item = { title: "Colaboradores", url: "/operadores", icon: UsersRound };

const conta: Item = { title: "Conta", url: "/conta", icon: User };
const configuracoes: Item = { title: "Configurações", url: "/configuracoes", icon: Settings };

const sidebarBg = "#F8F9FB";

function useSidebarData() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { role, profile } = useAuth();

  let mainItems: Item[];
  let cadastroItems: Item[];
  let bottomItems: Item[];
  const isOperational = !!profile?.parent_user_id;
  if (role === "admin") {
    mainItems = [dashboard, orcamentos, pedidos, relatorios];
    cadastroItems = [clientes, produtos, fornecedores, arquitetos, transportadoras, revendedores, colaboradores, operadores];
    bottomItems = [conta, configuracoes];
  } else if (role === "colaborador" || isOperational) {
    mainItems = [dashboard, orcamentos, pedidos];
    cadastroItems = [clientes, produtos, fornecedores, arquitetos, transportadoras];
    bottomItems = [conta];
  } else {
    mainItems = [dashboard, orcamentos, pedidos, relatorios];
    cadastroItems = [clientes, produtos, fornecedores, arquitetos, transportadoras, colaboradores, operadores];
    bottomItems = [conta, configuracoes];
  }


  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url);

  return { mainItems, cadastroItems, bottomItems, isActive, profile, pathname };
}


function ProfileAvatar() {
  const { user, profile, role, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const isChildAccount =
    !!profile?.parent_user_id || profile?.account_type === "operacional" || role === "colaborador";
  const canEditAvatar = !isChildAccount;

  const onPick = () => {
    if (!canEditAvatar) return;
    inputRef.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user || !canEditAvatar) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 5 MB).");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file, 320, 0.85);
      // Grava na EMPRESA ATIVA (empresa vinculada quando trocado), nunca
      // na conta de login diretamente. RPC valida permissão server-side.
      const { error } = await supabase.rpc("set_active_company_avatar", { _avatar: dataUrl });
      if (error) throw error;
      await refreshProfile();
      await qc.invalidateQueries({ queryKey: ["switchable-companies"] });
      toast.success("Foto de perfil atualizada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar foto.");
    } finally {
      setUploading(false);
    }
  };

  const onRemove = async () => {
    if (!canEditAvatar || !profile?.avatar_url) return;
    if (!window.confirm("Remover foto desta empresa?")) return;
    setRemoving(true);
    try {
      const { error } = await (supabase.rpc as any)("set_active_company_avatar", { _avatar: null });
      if (error) throw error;
      await refreshProfile();
      await qc.invalidateQueries({ queryKey: ["switchable-companies"] });
      toast.success("Foto removida.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover foto.");
    } finally {
      setRemoving(false);
    }
  };

  const avatar = profile?.avatar_url;
  const name = profile?.full_name || profile?.username || "";

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onPick}
        disabled={uploading || removing || !canEditAvatar}
        aria-label={canEditAvatar ? "Alterar foto de perfil" : "Foto herdada da conta principal"}
        title={canEditAvatar ? "Alterar foto de perfil" : "Foto herdada da conta principal"}
        className={cn(
          "h-28 w-28 rounded-full overflow-hidden bg-muted border-2 border-white shadow-md grid place-items-center",
          canEditAvatar
            ? "cursor-pointer transition hover:opacity-90 hover:ring-2 hover:ring-[hsl(var(--brand-end))]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-end))]/60"
            : "cursor-default",
          "disabled:cursor-wait",
        )}
      >
        {avatar ? (
          <img src={avatar} alt={name || "Foto de perfil"} className="h-full w-full object-cover pointer-events-none" />
        ) : (
          <User className="h-12 w-12 text-muted-foreground/60" strokeWidth={1.5} />
        )}
      </button>
      {canEditAvatar && (
        <>
          <button
            type="button"
            onClick={onPick}
            disabled={uploading || removing}
            aria-label="Alterar foto de perfil"
            title="Alterar foto de perfil"
            className={cn(
              "absolute bottom-0 right-0 h-9 w-9 rounded-full grid place-items-center cursor-pointer",
              "bg-gradient-brand text-brand-foreground shadow-brand border-2 border-white",
              "hover:opacity-95 hover:scale-105 transition disabled:opacity-60 disabled:cursor-wait",
            )}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pencil className="h-4 w-4" />
            )}
          </button>
          {avatar && (
            <button
              type="button"
              onClick={onRemove}
              disabled={uploading || removing}
              aria-label="Remover foto desta empresa"
              title="Remover foto desta empresa"
              className={cn(
                "absolute bottom-0 left-0 h-9 w-9 rounded-full grid place-items-center cursor-pointer",
                "bg-white text-destructive border-2 border-white shadow-md",
                "hover:bg-destructive hover:text-white hover:scale-105 transition disabled:opacity-60 disabled:cursor-wait",
              )}
            >
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          )}
        </>
      )}
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
  const { mainItems, cadastroItems, bottomItems, isActive, pathname } = useSidebarData();
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [switching, setSwitching] = useState<string | null>(null);

  // Só contas do tipo Empresa (revendedor sem parent) podem trocar de empresa
  const canSwitchCompany = role === "revendedor" && !profile?.parent_user_id;

  const listSwitchableFn = useServerFn(listSwitchableCompanies);
  const clearActiveFn = useServerFn(clearActiveCompany);
  const { switchToCompany } = useCompanySwitch();

  const { data: companies = [] } = useQuery({
    queryKey: ["switchable-companies"],
    enabled: canSwitchCompany,
    queryFn: () => listSwitchableFn() as Promise<Array<{
      id: string;
      full_name: string | null;
      store_name: string | null;
      avatar_url: string | null;
      is_active: boolean;
      is_self: boolean;
    }>>,
  });

  const activeCompany = companies.find((c) => c.is_active) ?? companies.find((c) => c.is_self);
  

  async function handleSwitchCompany(companyId: string) {
    const target = companies.find((c) => c.id === companyId);
    if (!target) return;
    setSwitching(companyId);
    const name = target.store_name || target.full_name || "empresa";
    await switchToCompany({ id: companyId, name, avatar_url: target.avatar_url });
    // Se retornar (erro), reabilita
    setSwitching(null);
  }

  async function handleSignOut() {
    try {
      await clearActiveFn();
    } catch {
      // Best-effort — não bloqueia o logout se a chamada falhar
    }
    await qc.cancelQueries();
    qc.clear();
    await signOut();
    navigate({ to: "/login", replace: true });
  }


  const cadastroHasActive = cadastroItems.some((i) => isActive(i.url));
  const [cadastroOpen, setCadastroOpen] = useState(cadastroHasActive);
  useEffect(() => {
    if (cadastroHasActive) setCadastroOpen(true);
  }, [cadastroHasActive, pathname]);

  const renderLink = (item: Item, indent = false) => {
    const active = isActive(item.url);
    return (
      <Link
        key={item.url}
        to={item.url}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all",
          indent && "pl-9",
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
        {mainItems.map((i) => renderLink(i))}

        <button
          type="button"
          onClick={() => setCadastroOpen((v) => !v)}
          className={cn(
            "mt-1 w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all",
            cadastroHasActive
              ? "text-foreground"
              : "text-foreground/75 hover:bg-accent hover:text-foreground",
          )}
          aria-expanded={cadastroOpen}
        >
          <FolderPlus className="h-4 w-4" />
          <span className="flex-1 text-left">Cadastro</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              cadastroOpen && "rotate-180",
            )}
          />
        </button>
        {cadastroOpen && (
          <div className="space-y-1">
            {cadastroItems.map((i) => renderLink(i, true))}
          </div>
        )}

        <div className="px-3 pt-6 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sistema
        </div>
        {bottomItems.map((i) => renderLink(i))}
      </nav>


      <div className="p-4 border-t border-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center gap-3 rounded-md bg-gradient-brand text-brand-foreground border border-black/10 shadow-brand p-3 text-left transition outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label="Menu da conta"
            >
              <div className="h-9 w-9 shrink-0 rounded-full overflow-hidden bg-white/15 ring-1 ring-white/25 grid place-items-center text-sm font-semibold text-brand-foreground uppercase">
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
              <div className="leading-tight min-w-0 flex-1">
                <div className="text-sm font-semibold truncate text-brand-foreground">
                  {profile?.full_name || profile?.username || "Usuário"}
                </div>
                {canSwitchCompany && activeCompany ? (
                  <div className="text-[11px] text-brand-foreground/80 truncate flex items-center gap-1">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{activeCompany.store_name || activeCompany.full_name || "Empresa"}</span>
                  </div>
                ) : profile?.username ? (
                  <div className="text-[11px] text-brand-foreground/80 font-mono truncate">
                    @{profile.username}
                  </div>
                ) : null}
              </div>
              <ChevronUp className="h-4 w-4 text-brand-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-64 mb-1">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm">{profile?.full_name || profile?.username || "Usuário"}</span>
              {profile?.username && (
                <span className="text-[11px] text-muted-foreground font-normal font-mono">
                  @{profile.username}
                </span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {canSwitchCompany && companies.filter((c) => !c.is_active).length > 0 && (
              <>
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Empresas vinculadas
                </DropdownMenuLabel>
                {companies
                  .filter((c) => !c.is_active)
                  .map((c) => {
                    const label = c.store_name || c.full_name || "Empresa";
                    return (
                      <DropdownMenuItem
                        key={c.id}
                        disabled={switching === c.id}
                        onClick={() => handleSwitchCompany(c.id)}
                        className="flex items-center gap-2"
                      >
                        <div className="h-6 w-6 shrink-0 rounded-full overflow-hidden bg-muted grid place-items-center">
                          {c.avatar_url ? (
                            <img src={c.avatar_url} alt={label} className="h-full w-full object-cover" />
                          ) : (
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <span className="flex-1 truncate text-sm">
                          Entrar na empresa {label}
                        </span>
                        {switching === c.id && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
                      </DropdownMenuItem>
                    );
                  })}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => { onNavigate?.(); navigate({ to: "/conta" }); }}>
              <User className="h-4 w-4 mr-2" /> Minha conta
            </DropdownMenuItem>
            {(role === "admin" || role === "revendedor") && (
              <DropdownMenuItem onClick={() => { onNavigate?.(); navigate({ to: "/configuracoes" }); }}>
                <Settings className="h-4 w-4 mr-2" /> Configurações
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

    </div>
  );
}

export function AppSidebar() {
  return (
    <aside
      className="hidden md:flex w-64 shrink-0 flex-col border-r border-border shadow-[2px_0_8px_-4px_rgba(15,23,42,0.08)] h-screen"
      style={{ backgroundColor: sidebarBg }}
    >
      <SidebarContents />
    </aside>
  );
}
