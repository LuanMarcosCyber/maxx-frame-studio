import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type WizardRow = { configured: boolean; product_count: number };

interface Props {
  label?: ReactNode;
  className?: string;
  variant?: "default" | "outline";
}

/**
 * Botão "Novo Orçamento / Novo Pedido" que verifica se há configuração
 * comercial pendente (Margem/Perda/MDOE-Perfil) antes de abrir o formulário.
 */
export function NovoOrcamentoButton({
  label = (
    <>
      <Plus className="h-4 w-4 mr-1.5" /> Novo Orçamento
    </>
  ),
  className = "bg-gradient-brand text-brand-foreground hover:opacity-95 shadow-brand",
}: Props) {
  const navigate = useNavigate();
  const { session, role } = useAuth();
  const [checking, setChecking] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  async function goToNew() {
    navigate({ to: "/orcamentos/novo" });
  }

  async function handleClick() {
    if (!session || role === "admin") {
      // Admin não é uma empresa operacional → segue direto.
      return goToNew();
    }
    setChecking(true);
    try {
      const { data, error } = await supabase.rpc("get_supplier_wizard_state");
      if (error) throw error;
      const pending = ((data ?? []) as WizardRow[]).filter(
        (r) => !r.configured && r.product_count > 0,
      );
      if (pending.length === 0) {
        await goToNew();
        return;
      }
      setPendingCount(pending.length);
      setModalOpen(true);
    } catch {
      // Falha ao consultar: não bloqueia o fluxo.
      await goToNew();
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <Button className={className} onClick={handleClick} disabled={checking}>
        {label}
      </Button>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Configuração comercial pendente
            </DialogTitle>
            <DialogDescription>
              {pendingCount === 1
                ? "1 fornecedor global"
                : `${pendingCount} fornecedores globais`}{" "}
              ainda não têm Margem, Perda (e Mão de obra para Perfil)
              configuradas para esta empresa. Sem esses valores, os produtos do
              catálogo global aparecem sem preço no orçamento.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setModalOpen(false);
                navigate({
                  to: "/produtos",
                  search: { configWizard: 1 } as never,
                });
              }}
            >
              Voltar e configurar
            </Button>
            <Button
              className="bg-gradient-brand text-brand-foreground hover:opacity-95"
              onClick={() => {
                setModalOpen(false);
                void goToNew();
              }}
            >
              Continuar mesmo assim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
