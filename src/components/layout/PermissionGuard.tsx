import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useOperator } from "@/hooks/useOperator";
import { PERMISSION_LABELS, type PermissionKey } from "@/lib/permissions";

/**
 * Bloqueia o acesso à página quando o usuário interno ativo não tem a
 * permissão exigida. Proprietário e Administrador Global passam sempre.
 * A validação também é feita no servidor — isto é a camada de navegação.
 */
export function PermissionGuard({
  permission,
  children,
}: {
  permission: PermissionKey;
  children: ReactNode;
}) {
  const { role, loading } = useAuth();
  const { activeOperator, hasPermission } = useOperator();
  const navigate = useNavigate();

  const allowed = role === "admin" || hasPermission(permission);
  // Aguarda a sessão/seleção de usuário para não bloquear indevidamente.
  const ready = !loading && !!role;
  const blocked = ready && !allowed;

  useEffect(() => {
    if (!blocked) return;
    const t = setTimeout(() => navigate({ to: "/", replace: true }), 2500);
    return () => clearTimeout(t);
  }, [blocked, navigate, activeOperator?.id]);

  if (blocked) {
    return (
      <AppShell title="Acesso restrito">
        <div className="max-w-md mx-auto mt-10 rounded-lg border border-border bg-card p-8 text-center shadow-sm">
          <ShieldAlert className="h-10 w-10 mx-auto text-amber-500 mb-3" />
          <h2 className="text-lg font-semibold mb-2">Você não possui permissão.</h2>
          <p className="text-sm text-muted-foreground mb-6">
            O acesso a <strong>{PERMISSION_LABELS[permission]}</strong> não foi liberado
            para o seu usuário. Fale com o proprietário da empresa.
          </p>
          <Button onClick={() => navigate({ to: "/", replace: true })}>
            Voltar ao Dashboard
          </Button>
        </div>
      </AppShell>
    );
  }

  return <>{children}</>;
}
