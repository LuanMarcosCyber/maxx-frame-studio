import { useEffect } from "react";

/**
 * Navegação global por teclado: ENTER funciona como TAB em qualquer
 * formulário do sistema.
 *
 * Regras:
 * - Enter em um campo editável move o foco para o próximo campo do formulário
 *   (ou do diálogo), sem submeter.
 * - Quando o próximo elemento é o botão de salvar, ele apenas recebe o foco.
 *   Um novo Enter (já no botão) executa a ação normalmente.
 * - Textarea: Enter avança; Shift+Enter quebra linha.
 * - Combobox/Select com dropdown aberto: Enter seleciona o item destacado
 *   (comportamento nativo do componente) e não avança.
 * - Escapes: adicione `data-enter="native"` no campo (ou em um ancestral)
 *   para desativar o comportamento naquele trecho.
 */
const FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"])',
  "select",
  "textarea",
  "button",
  "[href]",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(",");

const EDITABLE_SELECTOR = [
  'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"])',
  "select",
  "textarea",
  '[contenteditable="true"]',
].join(",");

/** Rótulos de botões secundários que o Enter nunca deve focar. */
const SECONDARY_RE =
  /(cancelar|voltar|fechar|sair|remover|excluir|descartar|mostrar senha|ocultar senha|close)/i;

/** Rótulos da ação principal de uma tela/modal. */
const PRIMARY_RE =
  /(entrar|salvar|confirmar|continuar|selecionar|ok|aplicar|criar|adicionar|avançar|concluir|finalizar)/i;

function labelOf(el: HTMLElement) {
  return `${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""}`.trim();
}

/** Botões auxiliares (ícones sem texto, cancelar/voltar/olho) são ignorados. */
function isSecondaryControl(el: HTMLElement) {
  if (el.dataset.enterSkip !== undefined) return true;
  if (el.tagName === "A") return true;
  if (el.tagName !== "BUTTON" && el.getAttribute("role") !== "button") return false;
  const label = labelOf(el);
  if (SECONDARY_RE.test(label)) return true;
  // Botão sem texto visível (ícone auxiliar, ex.: mostrar/ocultar senha)
  if (!(el.textContent ?? "").trim()) return true;
  return false;
}

function isPrimaryAction(el: HTMLElement) {
  if (el.dataset.enterPrimary !== undefined) return true;
  if (el instanceof HTMLButtonElement && el.type === "submit") return true;
  return PRIMARY_RE.test(labelOf(el));
}

function isVisible(el: HTMLElement) {
  if (el.hasAttribute("disabled")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  if (el.tabIndex === -1 && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return false;
  const rects = el.getClientRects();
  if (rects.length === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}


export function useEnterAsTab() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (e.defaultPrevented) return;
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.isComposing) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Botões / links: deixa o comportamento nativo (executa a ação).
      if (target.closest("button,a,[role='button']")) return;

      // Campo editável?
      if (!target.matches?.(EDITABLE_SELECTOR)) return;

      // Opt-out explícito
      if (target.closest('[data-enter="native"]')) return;

      // Dropdown aberto (Radix Select / combobox / autocomplete): deixa o
      // componente selecionar o item destacado.
      if (target.getAttribute("aria-expanded") === "true") return;
      if (target.closest("[cmdk-root]") && document.querySelector("[cmdk-list]")) return;

      const container =
        (target.closest("form,[role='dialog'],[data-enter-scope]") as HTMLElement | null) ??
        document.body;

      const items = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(isVisible);

      const index = items.indexOf(target);
      if (index === -1) return;

      const primary = items.find(isPrimaryAction);
      const rest = items.slice(index + 1).filter((el) => !isSecondaryControl(el));
      const nextEditable = rest.find((el) => el.matches(EDITABLE_SELECTOR));

      e.preventDefault();

      // Ainda há campos a preencher: apenas avança o foco.
      if (nextEditable) {
        focusNext(nextEditable);
        return;
      }

      // Último campo: telas de ação direta (login, PIN, confirmação) executam
      // a ação principal; formulários comuns focam o botão principal.
      const directSubmit = target.closest('[data-enter="submit"]') !== null;
      if (primary && (directSubmit || !rest.length)) {
        primary.click();
        return;
      }

      const next = rest[0] ?? primary;

      if (!next) return;
      next.focus();
      if (
        next instanceof HTMLInputElement ||
        next instanceof HTMLTextAreaElement
      ) {
        try {
          next.select();
        } catch {
          /* alguns tipos de input não suportam select() */
        }
      }

    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
}
