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

      const next = items[index + 1];
      e.preventDefault();
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
