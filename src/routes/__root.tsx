import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { OperatorProvider } from "@/hooks/useOperator";
import { useMobileKeyboardScroll } from "@/hooks/use-mobile-keyboard-scroll";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import logoUrl from "@/assets/totalmaxx-logo.png";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  // Recuperação automática: se o erro for de chunk antigo (cache pós-deploy),
  // força um reload "hard" pra buscar a nova versão do bundle.
  useEffect(() => {
    const msg = (error?.message ?? "").toLowerCase();
    const isStaleChunk =
      msg.includes("failed to fetch dynamically imported module") ||
      msg.includes("importing a module script failed") ||
      msg.includes("loading chunk") ||
      msg.includes("loading css chunk");
    if (isStaleChunk && typeof window !== "undefined") {
      const key = "__tm_reload_attempt";
      const tried = sessionStorage.getItem(key);
      if (!tried) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Não foi possível carregar esta página
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado. Tente recarregar ou voltar ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}


export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Total Maxx System— Gestão de Orçamentos e Pedidos" },
      { name: "description", content: "Total Maxx ERP — sistema web para revendedores criarem orçamentos e pedidos de componentes decorativos com agilidade e controle total." },
      { property: "og:site_name", content: "Total Maxx ERP" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Total Maxx System— Gestão de Orçamentos e Pedidos" },
      { name: "twitter:title", content: "Total Maxx System— Gestão de Orçamentos e Pedidos" },
      { property: "og:description", content: "Total Maxx ERP — sistema web para revendedores criarem orçamentos e pedidos de componentes decorativos com agilidade e controle total." },
      { name: "twitter:description", content: "Total Maxx ERP — sistema web para revendedores criarem orçamentos e pedidos de componentes decorativos com agilidade e controle total." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9126072c-5fd1-44b3-b1df-2873984aed30/id-preview-ff9007db--57e5c4b1-aaeb-49d3-a965-111b973ad91b.lovable.app-1781481245557.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9126072c-5fd1-44b3-b1df-2873984aed30/id-preview-ff9007db--57e5c4b1-aaeb-49d3-a965-111b973ad91b.lovable.app-1781481245557.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Total Maxx Import & Export",
          url: "https://maxx-frame-studio.lovable.app",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useMobileKeyboardScroll();

  // Recuperação global de chunks antigos (cache stale após deploy)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = "__tm_reload_attempt";
    // Limpa marcador antigo após carregar com sucesso
    const ok = setTimeout(() => sessionStorage.removeItem(key), 5000);

    const isStale = (msg: string) => {
      const m = msg.toLowerCase();
      return (
        m.includes("failed to fetch dynamically imported module") ||
        m.includes("importing a module script failed") ||
        m.includes("loading chunk") ||
        m.includes("loading css chunk")
      );
    };
    const tryReload = (msg: string) => {
      if (!isStale(msg)) return;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    };
    const onError = (e: ErrorEvent) => tryReload(e.message || "");
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const msg = typeof reason === "string" ? reason : reason?.message ?? "";
      tryReload(msg);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      clearTimeout(ok);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <Outlet />
        </AuthGate>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}


function AuthLoadingScreen() {
  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="flex flex-col items-center gap-4">
        <img
          src={logoUrl}
          alt="Total Maxx"
          className="h-16 w-auto opacity-90"
        />
        <p className="text-sm text-muted-foreground animate-pulse">Carregando...</p>
      </div>
    </div>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, role, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isLogin = pathname === "/login";

  // Considered ready only once auth has resolved AND, if signed in, role/profile loaded.
  const authReady = !loading && (!session || role !== null);

  useEffect(() => {
    if (!authReady) return;
    if (!session && !isLogin) navigate({ to: "/login", replace: true });
  }, [authReady, session, isLogin, navigate]);

  // Block rendering protected content until auth fully resolved.
  if (!authReady) {
    if (isLogin && !session) return <>{children}</>;
    return <AuthLoadingScreen />;
  }
  if (!session && !isLogin) return <AuthLoadingScreen />;
  return <>{children}</>;
}
