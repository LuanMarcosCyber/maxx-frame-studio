import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { validateOperatorPinV2 } from "@/lib/operators.functions";
import {
  can,
  OWNER_PERMISSIONS,
  type OperatorPermissions,
  type PermissionKey,
} from "@/lib/permissions";
import { setOperatorToken } from "@/lib/operator-token";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type { OperatorPermissions } from "@/lib/permissions";

export interface ActiveOperator {
  id: string;
  full_name: string;
  username: string | null;
  token?: string;
  permissions: OperatorPermissions;
}

interface OperatorContextValue {
  activeOperator: ActiveOperator | null;
  setActiveOperator: (op: ActiveOperator | null) => void;
  clearActiveOperator: () => void;
  effectivePermissions: OperatorPermissions;
  effectiveOperatorName: string;
  /** Avalia uma permissão do usuário interno ativo (proprietário passa sempre). */
  hasPermission: (key: PermissionKey) => boolean;
  requirePin: (action: string) => Promise<boolean>;
}

const STORAGE_PREFIX = "tm.activeOperator.";
const PIN_REUSE_MS = 5 * 60 * 1000;

const OperatorContext = createContext<OperatorContextValue | undefined>(undefined);

export function OperatorProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const userId = session?.user?.id ?? null;
  const storageKey = userId ? `${STORAGE_PREFIX}${userId}` : null;

  const [activeOperator, setActiveOperatorState] = useState<ActiveOperator | null>(null);
  const lastPinAtRef = useRef<number>(0);
  const validatePin = useServerFn(validateOperatorPinV2);

  // Modal state
  const [pinOpen, setPinOpen] = useState(false);
  const [pinAction, setPinAction] = useState<string>("");
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      setActiveOperatorState(null);
      return;
    }
    try {
      const raw = sessionStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as ActiveOperator) : null;
      setActiveOperatorState(parsed);
      setOperatorToken(parsed?.token ?? null);
    } catch {
      setActiveOperatorState(null);
      setOperatorToken(null);
    }
  }, [storageKey]);

  const setActiveOperator = useCallback(
    (op: ActiveOperator | null) => {
      setActiveOperatorState(op);
      setOperatorToken(op?.token ?? null);
      lastPinAtRef.current = op ? Date.now() : 0;
      if (!storageKey || typeof window === "undefined") return;
      if (op) sessionStorage.setItem(storageKey, JSON.stringify(op));
      else sessionStorage.removeItem(storageKey);
    },
    [storageKey],
  );

  const clearActiveOperator = useCallback(() => {
    setActiveOperator(null);
    lastPinAtRef.current = 0;
  }, [setActiveOperator]);

  const requirePin = useCallback(
    (action: string): Promise<boolean> => {
      if (!activeOperator) return Promise.resolve(false);
      // Reuse recent confirmation
      if (Date.now() - lastPinAtRef.current < PIN_REUSE_MS) {
        return Promise.resolve(true);
      }
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setPinAction(action);
        setPinValue("");
        setPinError(null);
        setPinOpen(true);
      });
    },
    [activeOperator],
  );

  const closePin = useCallback((ok: boolean) => {
    setPinOpen(false);
    setPinValue("");
    setPinError(null);
    const r = resolverRef.current;
    resolverRef.current = null;
    if (r) r(ok);
  }, []);

  async function submitPin() {
    if (!activeOperator || pinLoading) return;
    setPinLoading(true);
    setPinError(null);
    try {
      const result = (await validatePin({
        data: { operator_id: activeOperator.id, pin: pinValue },
      })) as unknown as ActiveOperator;
      // Renova o token assinado a cada confirmação de PIN.
      setActiveOperator({ ...activeOperator, ...result });
      lastPinAtRef.current = Date.now();
      setPinLoading(false);
      closePin(true);
    } catch (e) {
      setPinLoading(false);
      setPinError(e instanceof Error ? e.message : "PIN incorreto.");
    }
  }

  // Sem usuário interno ativo, a sessão pertence à própria empresa (login
  // principal), que tem acesso irrestrito. O SessionUserGate obriga a seleção.
  const effectivePermissions: OperatorPermissions = useMemo(() => {
    if (activeOperator) return activeOperator.permissions;
    return {
      ...OWNER_PERMISSIONS,
      max_discount_percent: Number(profile?.max_discount_percent ?? 100),
    };
  }, [activeOperator, profile]);

  const hasPermission = useCallback(
    (key: PermissionKey) => can(effectivePermissions, key),
    [effectivePermissions],
  );

  const effectiveOperatorName = useMemo(
    () => activeOperator?.full_name ?? profile?.full_name ?? profile?.username ?? "",
    [activeOperator, profile],
  );

  return (
    <OperatorContext.Provider
      value={{
        activeOperator,
        setActiveOperator,
        clearActiveOperator,
        effectivePermissions,
        effectiveOperatorName,
        hasPermission,
        requirePin,
      }}
    >
      {children}
      <Dialog
        open={pinOpen}
        onOpenChange={(o) => {
          if (!o) closePin(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar com PIN</DialogTitle>
            <DialogDescription>
              {pinAction
                ? `Confirme sua identidade para: ${pinAction}.`
                : "Confirme sua identidade para prosseguir."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="op-pin">PIN do usuário {activeOperator?.full_name}</Label>
              <Input
                id="op-pin"
                type="password"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitPin();
                }}
                placeholder="••••"
              />
              {pinError && (
                <p className="text-sm text-red-600 mt-1">{pinError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => closePin(false)} disabled={pinLoading}>
                Cancelar
              </Button>
              <Button
                onClick={submitPin}
                disabled={pinLoading || pinValue.length < 4}
              >
                {pinLoading ? "Validando..." : "Confirmar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </OperatorContext.Provider>
  );
}

export function useOperator() {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error("useOperator must be used within OperatorProvider");
  return ctx;
}

/** Atalho para checar uma permissão em qualquer componente. */
export function usePermission(key: PermissionKey): boolean {
  return useOperator().hasPermission(key);
}
