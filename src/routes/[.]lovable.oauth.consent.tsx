import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthNs = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
const getOAuthApi = () => (supabase.auth as unknown as { oauth: OAuthNs }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/login", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await getOAuthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen grid place-items-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold mb-2">Não foi possível carregar a autorização</h1>
        <p className="text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </p>
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData() as any;
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Nenhum redirecionamento foi retornado pelo servidor de autorização.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "aplicativo externo";

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-background">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold mb-2">
          Conectar {clientName} à sua conta
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Isto permite que {clientName} acesse os dados do seu Total Maxx ERP
          (clientes, produtos, orçamentos e pedidos) como você. Você pode revogar
          o acesso a qualquer momento.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive mb-4">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button
            className="flex-1 bg-gradient-brand text-brand-foreground hover:opacity-95"
            disabled={busy}
            onClick={() => decide(true)}
          >
            {busy ? "Processando..." : "Aprovar"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => decide(false)}
          >
            Negar
          </Button>
        </div>
      </div>
    </main>
  );
}
