import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { Loader2, Building2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { switchActiveCompany } from "@/lib/company-switch.functions";
import { toast } from "sonner";

type Target = {
  id: string;
  name: string;
  avatar_url: string | null;
};

type Ctx = {
  switchToCompany: (target: Target) => Promise<void>;
};

const CompanySwitchContext = createContext<Ctx | undefined>(undefined);

export function useCompanySwitch() {
  const ctx = useContext(CompanySwitchContext);
  if (!ctx) throw new Error("useCompanySwitch must be used within CompanySwitchProvider");
  return ctx;
}

export function CompanySwitchProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const switchFn = useServerFn(switchActiveCompany);

  const switchToCompany = useCallback(
    async (t: Target) => {
      setTarget(t);
      try {
        await switchFn({ data: { company_id: t.id } });
        // Recarrega completamente para garantir contexto limpo
        // (perfil, avatar, produtos, orçamentos, permissões, contadores...).
        window.location.assign("/");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setTarget(null);
        toast.error(
          `Não foi possível entrar na empresa selecionada. Você continua na empresa anterior. (${msg})`,
        );
      }
    },
    [switchFn],
  );

  return (
    <CompanySwitchContext.Provider value={{ switchToCompany }}>
      {children}
      {target && <SwitchOverlay target={target} />}
    </CompanySwitchContext.Provider>
  );
}

function SwitchOverlay({ target }: { target: Target }) {
  return (
    <div
      className="fixed inset-0 z-[9999] bg-white flex items-center justify-center px-6"
      role="status"
      aria-live="polite"
      onClickCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        <div className="h-28 w-28 rounded-full bg-muted overflow-hidden grid place-items-center border border-border shadow-sm">
          {target.avatar_url ? (
            <img
              src={target.avatar_url}
              alt={target.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Building2 className="h-12 w-12 text-muted-foreground" />
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wider text-muted-foreground font-medium">
            Entrando na empresa
          </p>
          <h2 className="text-2xl font-bold text-foreground">
            “{target.name}”
          </h2>
          <p className="text-sm text-muted-foreground">
            Estamos preparando os dados da empresa.
          </p>
        </div>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    </div>
  );
}
