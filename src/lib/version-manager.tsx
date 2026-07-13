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
 * Detecta novas versões publicadas do frontend comparando um "fingerprint"
 * do index.html (que muda a cada deploy porque referencia bundles com hash).
 *
 * - Tela segura (sem edição): mostra overlay elegante e recarrega.
 * - Tela com risco (dialog aberto, digitação recente, rota de edição, dirty
 *   registrado): mostra modal e espera o usuário salvar/decidir. Ao ficar
 *   segura novamente, aplica a atualização automaticamente.
 *
 * Uso opcional em formulários críticos:
 *   const setDirty = useDirtyGuard();
 *   useEffect(() => { setDirty(form.formState.isDirty); }, [form.formState.isDirty]);
 */

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

const POLL_INTERVAL_MS = 90_000; // 1m30s
const RECENT_TYPING_MS = 8_000;

async function fetchVersionFingerprint(): Promise<string | null> {
  try {
    const res = await fetch("/", {
      cache: "no-store",
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const etag = res.headers.get("etag");
    if (etag) return `etag:${etag}`;
    const text = await res.text();
    // Extrai referências a assets com hash (Vite): /assets/xxxx-HASH.js|css
    const matches = text.match(/\/[^"'\s]*assets\/[^"'\s]+\.(?:js|css)/g);
    if (matches && matches.length) return `assets:${matches.sort().join("|")}`;
    // Fallback: hash simples do body
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return `hash:${h}`;
  } catch {
    return null;
  }
}

async function clearCachesAndReload() {
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
  // Cache-bust final para forçar bypass de proxy/CDN.
  const url = new URL(window.location.href);
  url.searchParams.set("_v", String(Date.now()));
  window.location.replace(url.toString());
}

export function VersionUpdateProvider({ children }: { children: ReactNode }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [phase, setPhase] = useState<"idle" | "prompt" | "updating">("idle");
  const dirtyRef = useRef<Set<string>>(new Set());
  const [dirtyTick, setDirtyTick] = useState(0);
  const baselineRef = useRef<string | null>(null);
  const lastTypingRef = useRef<number>(0);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const registerDirty = useCallback((id: string) => {
    dirtyRef.current.add(id);
    setDirtyTick((t) => t + 1);
  }, []);
  const unregisterDirty = useCallback((id: string) => {
    dirtyRef.current.delete(id);
    setDirtyTick((t) => t + 1);
  }, []);

  // Baseline + polling
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let timer: number | undefined;

    const check = async () => {
      const fp = await fetchVersionFingerprint();
      if (cancelled || !fp) return;
      if (baselineRef.current === null) {
        baselineRef.current = fp;
        return;
      }
      if (fp !== baselineRef.current) {
        setUpdateAvailable(true);
      }
    };

    void check();
    timer = window.setInterval(check, POLL_INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVis);

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

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("input", onInput, true);
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
    setPhase("updating");
    // Pequeno delay para o fade da tela de transição.
    window.setTimeout(() => {
      void clearCachesAndReload();
    }, 1000);
  }, []);

  const triggerUpdate = useCallback(() => {
    beginUpdate();
  }, [beginUpdate]);

  // Orquestra a resposta à detecção de nova versão.
  useEffect(() => {
    if (!updateAvailable) return;
    if (phase === "updating") return;
    const risky = isRiskyNow();
    if (risky) {
      if (phase !== "prompt") setPhase("prompt");
      return;
    }
    // Rota segura -> atualiza automaticamente.
    beginUpdate();
  }, [updateAvailable, phase, isRiskyNow, beginUpdate, pathname, dirtyTick]);

  // Verifica periodicamente se o contexto ficou seguro (após salvar/fechar
  // um dialog / parar de digitar) para atualizar sem lembrete manual.
  useEffect(() => {
    if (!updateAvailable) return;
    if (phase === "updating") return;
    const t = window.setInterval(() => {
      if (!isRiskyNow()) {
        beginUpdate();
      }
    }, 2500);
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

// Um pequeno hack: "idle-prompted" não é do union; usamos string. Ajustamos:
type PromptPhase = "idle" | "prompt" | "idle-prompted" | "updating";
void (null as unknown as PromptPhase);

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
