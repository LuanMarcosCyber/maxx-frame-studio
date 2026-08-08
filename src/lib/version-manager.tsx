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
import { RefreshCw, ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { APP_VERSION, compareVersions } from "@/lib/app-version";

/**
 * Version Update Manager
 * ----------------------
 * Verifica a cada 60s o endpoint `/api/public/version` e compara com a
 * versão instalada (`APP_VERSION` em src/lib/app-version.ts).
 *
 * - Nunca recarrega sozinho: só ao clicar em "Atualizar agora".
 * - "Continuar trabalhando" silencia o aviso pelo resto da sessão.
 * - Apenas um verificador global (montado uma vez no root), com limpeza
 *   correta do timer ao desmontar.
 */

declare const __BUILD_ID__: string;
const CURRENT_BUILD_ID: string =
  typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";

const POLL_INTERVAL_MS = 60_000;
const DISMISS_KEY = "tm_version_dismissed";

type Ctx = {
  updateAvailable: boolean;
  currentVersion: string;
  availableVersion: string | null;
  registerDirty: (id: string) => void;
  unregisterDirty: (id: string) => void;
  triggerUpdate: () => void;
};

const VersionCtx = createContext<Ctx | undefined>(undefined);

/** Só verifica no domínio publicado (não em dev/preview/iframe). */
function isProductionRuntime(): boolean {
  if (typeof window === "undefined") return false;
  if (!import.meta.env.PROD) return false;
  const host = window.location.hostname;
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1") return false;
  if (host.startsWith("id-preview--")) return false;
  if (host.startsWith("preview--")) return false;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return false;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return false;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return false;
  try {
    if (window.self !== window.top) return false;
  } catch {
    return false;
  }
  return true;
}

async function fetchServerVersion(): Promise<{ version: string; build: string } | null> {
  try {
    const res = await fetch(`/api/public/version?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: unknown; build?: unknown };
    if (typeof data?.version !== "string" || !data.version) return null;
    return { version: data.version, build: typeof data.build === "string" ? data.build : "" };
  } catch {
    return null;
  }
}

async function clearCachesAndReload() {
  // Limpa apenas caches técnicos; sessão/localStorage permanecem intactos.
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => null)));
    }
  } catch {
    /* noop */
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => null)));
    }
  } catch {
    /* noop */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_v", String(Date.now()));
  window.location.replace(url.toString());
}

export function VersionUpdateProvider({ children }: { children: ReactNode }) {
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const dismissedRef = useRef<string | null>(null);
  const dirtyRef = useRef<Set<string>>(new Set());

  const registerDirty = useCallback((id: string) => {
    dirtyRef.current.add(id);
  }, []);
  const unregisterDirty = useCallback((id: string) => {
    dirtyRef.current.delete(id);
  }, []);

  useEffect(() => {
    if (!isProductionRuntime()) return;
    try {
      dismissedRef.current = sessionStorage.getItem(DISMISS_KEY);
    } catch {
      dismissedRef.current = null;
    }

    let cancelled = false;
    let inFlight = false;

    const check = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const info = await fetchServerVersion();
        if (!info || cancelled) return;
        const newer =
          compareVersions(info.version, APP_VERSION) > 0 ||
          (info.version === APP_VERSION && !!info.build && info.build !== CURRENT_BUILD_ID);
        if (!newer) return;
        setAvailableVersion(info.version);
        if (dismissedRef.current === info.version) return;
        setOpen(true);
      } finally {
        inFlight = false;
      }
    };

    const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS);
    const initial = window.setTimeout(() => void check(), 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(initial);
    };
  }, []);

  const triggerUpdate = useCallback(() => {
    setUpdating(true);
    void clearCachesAndReload();
  }, []);

  const keepWorking = useCallback(() => {
    setOpen(false);
    const v = availableVersion;
    dismissedRef.current = v;
    try {
      if (v) sessionStorage.setItem(DISMISS_KEY, v);
    } catch {
      /* noop */
    }
  }, [availableVersion]);

  const ctx = useMemo<Ctx>(
    () => ({
      updateAvailable: !!availableVersion,
      currentVersion: APP_VERSION,
      availableVersion,
      registerDirty,
      unregisterDirty,
      triggerUpdate,
    }),
    [availableVersion, registerDirty, unregisterDirty, triggerUpdate],
  );

  return (
    <VersionCtx.Provider value={ctx}>
      {children}
      <UpdatePromptDialog
        open={open}
        updating={updating}
        currentVersion={APP_VERSION}
        newVersion={availableVersion ?? ""}
        onKeepWorking={keepWorking}
        onUpdateNow={triggerUpdate}
      />
    </VersionCtx.Provider>
  );
}

export function useVersionUpdate(): Ctx {
  const ctx = useContext(VersionCtx);
  if (!ctx) throw new Error("useVersionUpdate must be used within VersionUpdateProvider");
  return ctx;
}

/**
 * Hook utilitário: marca um formulário como "dirty" no Version Manager.
 * Mantido por compatibilidade — o sistema nunca atualiza sozinho.
 */
export function useDirtyGuard() {
  const { registerDirty, unregisterDirty } = useVersionUpdate();
  const idRef = useRef<string>(
    `dirty_${Math.random().toString(36).slice(2)}_${Date.now()}`,
  );
  useEffect(() => {
    const id = idRef.current;
    return () => unregisterDirty(id);
  }, [unregisterDirty]);
  return useCallback(
    (dirty: boolean) => {
      const id = idRef.current;
      if (dirty) registerDirty(id);
      else unregisterDirty(id);
    },
    [registerDirty, unregisterDirty],
  );
}

function UpdatePromptDialog({
  open,
  updating,
  currentVersion,
  newVersion,
  onKeepWorking,
  onUpdateNow,
}: {
  open: boolean;
  updating: boolean;
  currentVersion: string;
  newVersion: string;
  onKeepWorking: () => void;
  onUpdateNow: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onKeepWorking()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary/10 text-primary grid place-items-center">
            <ArrowUpCircle className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center tracking-wide">
            NOVA VERSÃO DISPONÍVEL
          </DialogTitle>
          <DialogDescription className="text-center">
            Uma nova versão do TOTALMAXX está disponível.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Versão atual</span>
            <span className="font-medium">{currentVersion}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted-foreground">Nova versão</span>
            <span className="font-semibold text-primary">{newVersion}</span>
          </div>
        </div>
        <DialogFooter className="sm:justify-center gap-2">
          <Button variant="outline" onClick={onKeepWorking} disabled={updating}>
            Continuar trabalhando
          </Button>
          <Button
            onClick={onUpdateNow}
            disabled={updating}
            className="bg-gradient-brand text-brand-foreground hover:opacity-95"
          >
            <RefreshCw className={updating ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            {updating ? "Atualizando..." : "Atualizar agora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
