import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

interface AppShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AppShell({ title, subtitle, children }: AppShellProps) {
  const { isActive, role, signOut, loading } = useAuth();
  const blocked = !loading && role === "colaborador" && !isActive;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <AppHeader title={title} subtitle={subtitle} />
        <main className="flex-1 p-4 sm:p-6 lg:p-10 bg-background">
          {blocked ? (
            <div className="max-w-md mx-auto mt-10 rounded-lg border border-border bg-card p-8 text-center shadow-sm">
              <h2 className="text-lg font-semibold mb-2">Usuário desativado</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Sua conta está desativada. Entre em contato com o responsável.
              </p>
              <Button
                onClick={() => signOut()}
                className="bg-gradient-brand text-brand-foreground hover:opacity-95"
              >
                Sair
              </Button>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
