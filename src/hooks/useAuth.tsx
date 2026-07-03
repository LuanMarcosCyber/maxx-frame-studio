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
        .select("full_name, username, email, phone, document, document_type, address, cep, address_number, city, state, store_name, parent_user_id, active, avatar_url, can_edit_budgets, can_create_products, can_create_clients, can_delete_orders, max_discount_percent")
        .eq("id", userId)
        .maybeSingle(),
    ]);
    const roles = new Set((roleRows ?? []).map((row) => row.role as AppRole));
    const resolvedRole: AppRole = profileRow?.parent_user_id
      ? "colaborador"
      : roles.has("admin")
        ? "admin"
        : roles.has("revendedor")
          ? "revendedor"
          : roles.has("colaborador")
            ? "colaborador"
            : "revendedor";
    setRole(resolvedRole);
    setProfile(
      (profileRow as Profile | null) ?? {
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
        active: true,
        avatar_url: null,
        can_edit_budgets: true,
        can_create_products: true,
        can_create_clients: true,
        can_delete_orders: false,
        max_discount_percent: 100,
      },
    );
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
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const ownerUserId =
    profile?.parent_user_id ?? session?.user?.id ?? null;
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
