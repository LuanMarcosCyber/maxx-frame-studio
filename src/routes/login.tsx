import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import logoTotalMaxx from "@/assets/totalmaxx-logo.png";
import logoTotalMaxxDark from "@/assets/totalmaxx-logo-dark.png";
import { useTheme } from "@/hooks/useTheme";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — Total Maxx ERP" }] }),
  component: Login,
});

function Login() {
  const { signIn, session, loading } = useAuth();
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const logoSrc = resolvedTheme === "dark" ? logoTotalMaxxDark : logoTotalMaxx;
  const sidePanelBg = resolvedTheme === "dark" ? "bg-card" : "bg-white";

  useEffect(() => {
    if (!loading && session) navigate({ to: "/", replace: true });
  }, [session, loading, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    const { error } = await signIn(username, password);
    setSubmitting(false);
    if (error) toast.error(error);
    else navigate({ to: "/", replace: true });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-white border-r border-border">
        <div className="flex items-center justify-center">
          <img
            src={logoTotalMaxx}
            alt="Total Maxx Import & Export"
            className="max-h-20 w-auto object-contain"
          />
        </div>
        <div>
          <h2 className="text-4xl font-bold leading-tight text-foreground">
            Orçamentos de molduras com precisão profissional.
          </h2>
          <p className="mt-4 text-muted-foreground max-w-md">
            Gerencie molduras, foam, paspatur, vidro e componentes em um só lugar.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Total Maxx Import & Export
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center justify-center mb-8">
            <img
              src={logoTotalMaxx}
              alt="Total Maxx Import & Export"
              className="max-h-16 w-auto object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Acesse sua conta</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Entre com o usuário e senha fornecidos pelo administrador.
          </p>

          <form onSubmit={onSubmit} className="space-y-4 mt-8">
            <div className="space-y-1.5">
              <Label htmlFor="username">Usuário</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="seu.usuario"
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
