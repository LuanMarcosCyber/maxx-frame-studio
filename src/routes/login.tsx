import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Frame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — Total Maxx ERP" }] }),
  component: Login,
});

function Login() {
  const { signIn, session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/", replace: true });
  }, [session, loading, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (error) toast.error(error);
    else navigate({ to: "/", replace: true });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-brand text-brand-foreground">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-lg bg-brand-foreground/10 border border-brand-foreground/20 grid place-items-center">
            <Frame className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-bold">Total Maxx</div>
            <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">
              ERP Revendedor
            </div>
          </div>
        </div>
        <div>
          <h2 className="text-4xl font-bold leading-tight">
            Orçamentos de molduras com precisão profissional.
          </h2>
          <p className="mt-4 text-brand-foreground/80 max-w-md">
            Gerencie molduras, foam, paspatur, vidro e componentes em um só lugar.
          </p>
        </div>
        <div className="text-xs text-brand-foreground/60">
          © {new Date().getFullYear()} Total Maxx
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-lg bg-gradient-brand grid place-items-center shadow-brand">
              <Frame className="h-5 w-5 text-brand-foreground" />
            </div>
            <div className="font-bold">Total Maxx</div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Acesse sua conta</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Entre com o e-mail e senha fornecidos pelo administrador.
          </p>

          <form onSubmit={onSubmit} className="space-y-4 mt-8">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand"
            >
              {submitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
