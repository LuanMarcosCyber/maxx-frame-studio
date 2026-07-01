import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/hooks/useAuth";

export interface OperatorPermissions {
  can_edit_budgets: boolean;
  can_create_products: boolean;
  can_create_clients: boolean;
  can_delete_orders: boolean;
  max_discount_percent: number;
}

export interface ActiveOperator {
  id: string;
  full_name: string;
  username: string | null;
  permissions: OperatorPermissions;
}

interface OperatorContextValue {
  activeOperator: ActiveOperator | null;
  setActiveOperator: (op: ActiveOperator | null) => void;
  effectivePermissions: OperatorPermissions;
  effectiveOperatorName: string;
}

const STORAGE_PREFIX = "tm.activeOperator.";

const OperatorContext = createContext<OperatorContextValue | undefined>(undefined);

export function OperatorProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const userId = session?.user?.id ?? null;
  const storageKey = userId ? `${STORAGE_PREFIX}${userId}` : null;

  const [activeOperator, setActiveOperatorState] = useState<ActiveOperator | null>(null);

  // Restore per-user on mount / session change.
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      setActiveOperatorState(null);
      return;
    }
    try {
      const raw = sessionStorage.getItem(storageKey);
      setActiveOperatorState(raw ? (JSON.parse(raw) as ActiveOperator) : null);
    } catch {
      setActiveOperatorState(null);
    }
  }, [storageKey]);

  const setActiveOperator = useCallback(
    (op: ActiveOperator | null) => {
      setActiveOperatorState(op);
      if (!storageKey || typeof window === "undefined") return;
      if (op) sessionStorage.setItem(storageKey, JSON.stringify(op));
      else sessionStorage.removeItem(storageKey);
    },
    [storageKey],
  );

  const effectivePermissions: OperatorPermissions = useMemo(() => {
    if (activeOperator) return activeOperator.permissions;
    return {
      can_edit_budgets: profile?.can_edit_budgets ?? true,
      can_create_products: profile?.can_create_products ?? true,
      can_create_clients: profile?.can_create_clients ?? true,
      can_delete_orders: profile?.can_delete_orders ?? false,
      max_discount_percent: Number(profile?.max_discount_percent ?? 100),
    };
  }, [activeOperator, profile]);

  const effectiveOperatorName = useMemo(
    () => activeOperator?.full_name ?? profile?.full_name ?? profile?.username ?? "",
    [activeOperator, profile],
  );

  return (
    <OperatorContext.Provider
      value={{ activeOperator, setActiveOperator, effectivePermissions, effectiveOperatorName }}
    >
      {children}
    </OperatorContext.Provider>
  );
}

export function useOperator() {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error("useOperator must be used within OperatorProvider");
  return ctx;
}
