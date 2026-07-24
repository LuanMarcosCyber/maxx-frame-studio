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
import { useRouterState } from "@tanstack/react-router";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import logoUrl from "@/assets/totalmaxx-logo.png";

/**
 * Version Update Manager
 * ----------------------
 * Detecta novas versões publicadas comparando um BUILD_ID único injetado
 * em build-time (via Vite `define`) com o valor servido pelo endpoint
 * `/api/public/version` do deploy atual.
 *
 * - Ativo apenas no domínio publicado de produção (não roda em dev nem no
 *   Preview do Lovable), evitando falsos positivos durante edição.
 * - Verifica a cada 60s, ao voltar para a aba, ao focar a janela e quando
 *   a conexão volta.
 * - Notifica todas as abas via BroadcastChannel para atualizarem juntas.
 * - Usa uma trava `isUpdating` para nunca executar reload duplicado.
 * - Em telas de edição (dialog aberto, digitando, rota de risco, dirty
 *   registrado) mostra o modal e aplica automaticamente quando ficar seguro.
 */

// Build ID inlined at build time; muda a cada novo deploy.
declare const __BUILD_ID__: string;
const CURRENT_BUILD_ID: string =
  typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";

type Ctx = {
  updateAvailable: boolean;
  registerDirty: (id: string) => void;
  unregisterDirty: (id: string) => void;
  triggerUpdate: () => void;
};

const VersionCtx = createContext<Ctx | undefined>(undefined);

// Rotas conhecidamente perigosas (formulários grandes fora de <Dialog>).
const RISKY_PATH_PATTERNS: RegExp[] = [
  /^\/orcamentos\/novo/i,
  /^\/orcamentos\/[^/]+\/editar/i,
  /^\/pedidos\/[^/]+\/editar/i,
];

const POLL_INTERVAL_MS = 60_000;
const RECENT_TYPING_MS = 8_000;
const BROADCAST_CHANNEL = "tm-version-update";

type PromptPhase = "idle" | "prompt" | "idle-prompted" | "updating";

/**
 * Só roda a verificação no domínio publicado de produção. Retorna false
 * em dev, localhost, iframes do Lovable e domínios de Preview.
 */
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

async function fetchServerVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/api/public/version?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: unknown };
    if (typeof data?.version !== "string" || !data.version) return null;
    return data.version;
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
  // Preserva a rota atual, apenas força bypass de cache/CDN.
  const url = new URL(window.location.href);
  url.searchParams.set("_v", String(Date.now()));
  window.location.replace(url.toString());
}

export function VersionUpdateProvider({ children }: { children: ReactNode }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [phase, setPhase] = useState<PromptPhase>("idle");
  const dirtyRef = useRef<Set<string>>(new Set());
  const [dirtyTick, setDirtyTick] = useState(0);
  const lastTypingRef = useRef<number>(0);
  const updatingRef = useRef(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const registerDirty = useCallback((id: string) => {
    dirtyRef.current.add(id);
    setDirtyTick((t) => t + 1);
  }, []);
  const unregisterDirty = useCallback((id: string) => {
    dirtyRef.current.delete(id);
    setDirtyTick((t) => t + 1);
  }, []);

  // Detecção + polling de nova versão
  useEffect(() => {
    if (!isProductionRuntime()) return;

    let cancelled = false;
    let inFlight = false;

    const markAvailable = () => {
      if (cancelled) return;
      setUpdateAvailable(true);
    };

    const check = async () => {
      if (cancelled || inFlight || updatingRef.current) return;
      inFlight = true;
      try {
        const serverVersion = await fetchServerVersion();
        if (!serverVersion) return; // falha de rede => tenta de novo depois
        if (serverVersion !== CURRENT_BUILD_ID) {
          markAvailable();
          try {
            bc?.postMessage({ type: "update-available", version: serverVersion });
          } catch {
            /* noop */
          }
        }
      } finally {
        inFlight = false;
      }
    };

    // BroadcastChannel para sincronizar as abas.
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(BROADCAST_CHANNEL);
      bc.onmessage = (ev) => {
        if (ev?.data?.type === "update-available") markAvailable();
      };
    } catch {
      bc = null;
    }

    const timer = window.setInterval(check, POLL_INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onFocus = () => void check();
    const onOnline = () => void check();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    // Rastreia digitação recente para não interromper o usuário.
    const onInput = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t.isContentEditable
      ) {
        lastTypingRef.current = Date.now();
      }
    };
    document.addEventListener("input", onInput, true);

    // Primeira verificação após pequeno delay para não competir com boot.
    const initial = window.setTimeout(() => void check(), 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(initial);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("input", onInput, true);
      try {
        bc?.close();
      } catch {
        /* noop */
      }
    };
  }, []);

  const isRiskyPath = useMemo(
    () => RISKY_PATH_PATTERNS.some((r) => r.test(pathname)),
    [pathname],
  );

  const isRiskyNow = useCallback((): boolean => {
    if (dirtyRef.current.size > 0) return true;
    if (isRiskyPath) return true;
    if (typeof document !== "undefined") {
      const openDialog = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      );
      if (openDialog) return true;
    }
    if (Date.now() - lastTypingRef.current < RECENT_TYPING_MS) return true;
    return false;
  }, [isRiskyPath]);

  const beginUpdate = useCallback(() => {
    if (updatingRef.current) return;
    updatingRef.current = true;
    setPhase("updating");
    window.setTimeout(() => {
      void clearCachesAndReload();
    }, 2_000);
  }, []);

  const triggerUpdate = useCallback(() => {
    beginUpdate();
  }, [beginUpdate]);

  // Resposta à detecção de nova versão.
  useEffect(() => {
    if (!updateAvailable) return;
    if (phase === "updating") return;
    const risky = isRiskyNow();
    if (risky) {
      if (phase !== "prompt") setPhase("prompt");
      return;
    }
    beginUpdate();
  }, [updateAvailable, phase, isRiskyNow, beginUpdate, pathname, dirtyTick]);

  // Verifica periodicamente se o contexto ficou seguro para atualizar
  // automaticamente após salvar/fechar dialog / parar de digitar.
  useEffect(() => {
    if (!updateAvailable) return;
    if (phase === "updating") return;
    const t = window.setInterval(() => {
      if (!isRiskyNow()) beginUpdate();
    }, 2_500);
    return () => window.clearInterval(t);
  }, [updateAvailable, phase, isRiskyNow, beginUpdate]);

  const ctx = useMemo<Ctx>(
    () => ({ updateAvailable, registerDirty, unregisterDirty, triggerUpdate }),
    [updateAvailable, registerDirty, unregisterDirty, triggerUpdate],
  );

  return (
    <VersionCtx.Provider value={ctx}>
      {children}
      <UpdatePromptDialog
        open={phase === "prompt"}
        onKeepWorking={() => setPhase("idle-prompted")}
        onUpdateNow={beginUpdate}
      />
      {phase === "updating" && <UpdatingOverlay />}
    </VersionCtx.Provider>
  );
}

export function useVersionUpdate(): Ctx {
  const ctx = useContext(VersionCtx);
  if (!ctx) throw new Error("useVersionUpdate must be used within VersionUpdateProvider");
  return ctx;
}

/**
 * Hook utilitário: retorna um setter que registra/desregistra o form
 * como "dirty" no Version Manager. Use em formulários críticos.
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
  onKeepWorking,
  onUpdateNow,
}: {
  open: boolean;
  onKeepWorking: () => void;
  onUpdateNow: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onKeepWorking()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-amber-100 text-amber-700 grid place-items-center">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center tracking-wide">
            NOVA VERSÃO DISPONÍVEL
          </DialogTitle>
          <DialogDescription className="text-center">
            Uma nova versão do sistema já está disponível.
            <br />
            Para evitar perda de informações, termine esta operação antes de
            atualizar.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center gap-2">
          <Button variant="outline" onClick={onKeepWorking}>
            Continuar trabalhando
          </Button>
          <Button
            onClick={onUpdateNow}
            className="bg-gradient-brand text-brand-foreground hover:opacity-95"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UpdatingOverlay() {
  return (
    <div
      className="fixed inset-0 z-[10000] bg-white flex items-center justify-center px-6 animate-fade-in"
      role="status"
      aria-live="polite"
      onClickCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        <img src={logoUrl} alt="Total Maxx" className="h-14 w-auto opacity-90" />
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 rounded-full border-2 border-muted" />
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <RefreshCw className="absolute inset-0 m-auto h-6 w-6 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-wider text-foreground">
            ATUALIZANDO O SISTEMA
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Uma nova versão foi publicada.
            <br />
            Estamos carregando automaticamente as melhorias.
          </p>
        </div>
        <div className="h-1 w-48 bg-muted rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-primary animate-[slide-in-right_1.2s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  );
}
