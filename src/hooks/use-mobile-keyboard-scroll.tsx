import { useEffect } from "react";

/**
 * Global mobile UX helper: when a text-like field receives focus on a small
 * screen, scroll it into the visible area above the virtual keyboard, keeping
 * a safety margin so dropdowns/option lists remain readable.
 *
 * Also appends a temporary spacer at the end of <body> so short pages have
 * enough scrollable height to keep the focused field above the keyboard.
 */
export function useMobileKeyboardScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

    const TYPING_SELECTOR =
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]),textarea,[contenteditable="true"],[role="combobox"],[role="searchbox"]';

    const SAFE_MARGIN = 120;
    const SPACER_ID = "__mobile-keyboard-spacer__";
    const SPACER_HEIGHT = 380;

    const ensureSpacer = () => {
      let spacer = document.getElementById(SPACER_ID);
      if (!spacer) {
        spacer = document.createElement("div");
        spacer.id = SPACER_ID;
        spacer.setAttribute("aria-hidden", "true");
        spacer.style.cssText = `height:${SPACER_HEIGHT}px;width:100%;flex-shrink:0;pointer-events:none;`;
        document.body.appendChild(spacer);
      }
      return spacer;
    };

    const removeSpacer = () => {
      const spacer = document.getElementById(SPACER_ID);
      if (spacer) spacer.remove();
    };

    const scrollIntoSafeArea = (el: Element) => {
      if (!(el instanceof HTMLElement)) return;
      const rect = el.getBoundingClientRect();
      const vv = window.visualViewport;
      const viewportHeight = vv?.height ?? window.innerHeight;
      const viewportTop = vv?.offsetTop ?? 0;

      const safeBottom = viewportTop + viewportHeight - SAFE_MARGIN;
      const safeTop = viewportTop + 16;

      let delta = 0;
      if (rect.bottom > safeBottom) {
        delta = rect.bottom - safeBottom;
      } else if (rect.top < safeTop) {
        delta = rect.top - safeTop;
      }

      if (delta !== 0) {
        window.scrollBy({ top: delta, behavior: "smooth" });
      }
    };

    let blurTimer: number | undefined;

    const handleFocusIn = (e: FocusEvent) => {
      if (!isMobile()) return;
      const target = e.target as Element | null;
      if (!target) return;
      if (!target.matches?.(TYPING_SELECTOR)) return;

      if (blurTimer) {
        window.clearTimeout(blurTimer);
        blurTimer = undefined;
      }
      ensureSpacer();

      // Wait for the virtual keyboard to open and the visualViewport to update.
      window.setTimeout(() => scrollIntoSafeArea(target), 300);
    };

    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (!target?.matches?.(TYPING_SELECTOR)) return;
      if (blurTimer) window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        const active = document.activeElement;
        if (!active || !(active as Element).matches?.(TYPING_SELECTOR)) {
          removeSpacer();
        }
      }, 200);
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    const vv = window.visualViewport;
    const handleViewportResize = () => {
      if (!isMobile()) return;
      const active = document.activeElement;
      if (!active) return;
      if (!(active as Element).matches?.(TYPING_SELECTOR)) return;
      scrollIntoSafeArea(active);
    };
    vv?.addEventListener("resize", handleViewportResize);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      vv?.removeEventListener("resize", handleViewportResize);
      if (blurTimer) window.clearTimeout(blurTimer);
      removeSpacer();
    };
  }, []);
}
