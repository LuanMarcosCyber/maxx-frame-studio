import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "revendedor" | "colaborador";
export const EMAIL_DOMAIN = "totalmaxx.local";
export const usernameToEmail = (username: string) =>
  `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

interface Profile {
  full_name: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  document: string | null;
  document_type: string | null;
  address: string | null;
  cep: string | null;
  address_number: string | null;
  city: string | null;
  state: string | null;
  store_name: string | null;
  parent_user_id: string | null;
  account_type: "admin" | "revendedor" | "operacional" | null;
  active: boolean;
  avatar_url: string | null;
  can_edit_budgets: boolean;
  can_create_products: boolean;
  can_create_clients: boolean;
  can_delete_orders: boolean;
  max_discount_percent: number;
}


interface AuthContextValue {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  profile: Profile | null;
  ownerUserId: string | null;
  effectiveOwnerId: string | null;
  isActive: boolean;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [effectiveOwnerId, setEffectiveOwnerId] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadUserData(s.user.id), 0);
      } else {
        setRole(null);
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) loadUserData(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserData = async (userId: string) => {
    const [{ data: roleRows }, { data: profileRow }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("profiles")
        .select("full_name, username, email, phone, document, document_type, address, cep, address_number, city, state, store_name, parent_user_id, account_type, active, avatar_url, can_edit_budgets, can_create_products, can_create_clients, can_delete_orders, max_discount_percent")
        .eq("id", userId)
        .maybeSingle(),
    ]);
    const roles = new Set((roleRows ?? []).map((row) => row.role as AppRole));
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
    const metadata = currentSession?.user?.user_metadata ?? {};
    const rawMetadataParentId = metadata.parent_user_id ?? metadata.owner_user_id ?? metadata.created_by;
    const fallbackParentId = typeof rawMetadataParentId === "string" && rawMetadataParentId ? rawMetadataParentId : null;
    const parentUserId = profileRow?.parent_user_id ?? fallbackParentId;
    const isOperationalAccount = !!parentUserId || profileRow?.account_type === "operacional";
    const resolvedRole: AppRole = isOperationalAccount
      ? "colaborador"
      : roles.has("admin")
        ? "admin"
        : roles.has("revendedor")
          ? "revendedor"
          : roles.has("colaborador")
            ? "colaborador"
            : "revendedor";
    setRole(resolvedRole);
    const baseProfile = (profileRow as Profile | null) ?? {
        full_name: null,
        username: null,
        email: null,
        phone: null,
        document: null,
        document_type: null,
        address: null,
        cep: null,
        address_number: null,
        city: null,
        state: null,
        store_name: null,
        parent_user_id: null,
        account_type: null,
        active: true,
        avatar_url: null,
        can_edit_budgets: true,
        can_create_products: true,
        can_create_clients: true,
        can_delete_orders: false,
        max_discount_percent: 100,
      };

    let mergedProfile: Profile = { ...baseProfile, parent_user_id: parentUserId };

    // Perfil efetivo (respeita active_company_id para trocas entre empresas vinculadas
    // e parent_user_id para contas de acesso). Sobrescreve identidade visual + dados
    // comerciais para refletir a empresa ativa.
    try {
      const { data: effRows } = await (supabase.rpc as any)("get_effective_profile");
      const eff = Array.isArray(effRows) ? effRows[0] : effRows;
      if (eff) {
        mergedProfile = {
          ...mergedProfile,
          // Empresas vinculadas NÃO compartilham identidade. Ao trocar,
          // usamos estritamente os campos da empresa ativa (sem fallback
          // para os dados da conta de login) para evitar vazamento visual.
          avatar_url: eff.is_switched ? (eff.avatar_url ?? null) : (eff.avatar_url ?? mergedProfile.avatar_url),
          store_name: eff.is_switched ? (eff.store_name ?? null) : (eff.store_name ?? mergedProfile.store_name),
          email: eff.is_switched ? (eff.email ?? null) : (eff.email ?? mergedProfile.email),
          phone: eff.is_switched ? (eff.phone ?? null) : (eff.phone ?? mergedProfile.phone),
          document: eff.is_switched ? (eff.document ?? null) : (eff.document ?? mergedProfile.document),
          document_type: eff.is_switched ? (eff.document_type ?? null) : (eff.document_type ?? mergedProfile.document_type),
          cep: eff.is_switched ? (eff.cep ?? null) : (eff.cep ?? mergedProfile.cep),
          address: eff.is_switched ? (eff.address ?? null) : (eff.address ?? mergedProfile.address),
          address_number: eff.is_switched ? (eff.address_number ?? null) : (eff.address_number ?? mergedProfile.address_number),
          city: eff.is_switched ? (eff.city ?? null) : (eff.city ?? mergedProfile.city),
          state: eff.is_switched ? (eff.state ?? null) : (eff.state ?? mergedProfile.state),
          full_name: eff.is_switched
            ? (eff.full_name ?? mergedProfile.full_name)
            : mergedProfile.full_name,
        };
      }
    } catch (err) {
      console.error("Erro ao carregar perfil efetivo", err);
    }

    setProfile(mergedProfile);
  };



  const refreshProfile = async () => {
    if (session?.user) await loadUserData(session.user.id);
  };


  const signIn = async (username: string, password: string) => {
    const email = usernameToEmail(username);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Mask technical email-related errors with a user-friendly message
      return { error: "Usuário ou senha inválidos." };
    }
    // Toda sessão nova começa na EMPRESA do login. Empresas vinculadas
    // ativadas em sessões anteriores não persistem entre logins.
    try {
      await supabase.rpc("clear_active_company");
    } catch (err) {
      console.warn("clear_active_company falhou no login", err);
    }
    return { error: null };
  };

  const signOut = async () => {
    // Limpa a empresa ativa antes de encerrar a sessão para que o próximo
    // login inicie sempre na empresa principal.
    try {
      await supabase.rpc("clear_active_company");
    } catch {
      // best-effort
    }
    await supabase.auth.signOut();
  };

  const ownerUserId = profile?.parent_user_id ?? session?.user?.id ?? null;
  const isActive = profile?.active ?? true;

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        role,
        profile,
        ownerUserId,
        isActive,
        loading,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
