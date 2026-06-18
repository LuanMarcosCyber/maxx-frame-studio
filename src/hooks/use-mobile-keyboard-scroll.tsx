import { useEffect } from "react";

/**
 * Global mobile UX helper: when a text-like field receives focus on a small
 * screen, scroll it into view above the virtual keyboard and add a temporary
 * spacer so short pages have enough scrollable height. The spacer fades away
 * gracefully after blur to avoid abrupt layout jumps.
 */
export function useMobileKeyboardScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

    const TYPING_SELECTOR =
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]),textarea,[contenteditable="true"],[role="combobox"],[role="searchbox"]';

    const SAFE_MARGIN = 140;
    const SPACER_ID = "__mobile-keyboard-spacer__";
    const SPACER_HEIGHT = 420;
    const SPACER_REMOVE_DELAY = 1200; // ms — keep spacer briefly after blur
    const SPACER_FADE_MS = 400;

    const ensureSpacer = () => {
      let spacer = document.getElementById(SPACER_ID);
      if (!spacer) {
        spacer = document.createElement("div");
        spacer.id = SPACER_ID;
        spacer.setAttribute("aria-hidden", "true");
        spacer.style.cssText = `height:${SPACER_HEIGHT}px;width:100%;flex-shrink:0;pointer-events:none;opacity:0;transition:opacity ${SPACER_FADE_MS}ms ease,height ${SPACER_FADE_MS}ms ease;`;
        document.body.appendChild(spacer);
        // next frame: fade in
        requestAnimationFrame(() => {
          if (spacer) spacer.style.opacity = "1";
        });
      } else {
        spacer.style.height = `${SPACER_HEIGHT}px`;
        spacer.style.opacity = "1";
      }
      return spacer;
    };

    const removeSpacerSmooth = () => {
      const spacer = document.getElementById(SPACER_ID);
      if (!spacer) return;
      spacer.style.opacity = "0";
      spacer.style.height = "0px";
      window.setTimeout(() => {
        const s = document.getElementById(SPACER_ID);
        if (s) s.remove();
      }, SPACER_FADE_MS);
    };

    const scrollIntoSafeArea = (el: Element) => {
      if (!(el instanceof HTMLElement)) return;

      // Prefer native smooth scroll to center the field in the visible area.
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        /* older browsers */
      }

      // Follow-up correction using visualViewport (keyboard) measurements.
      window.setTimeout(() => {
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
      }, 250);
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
      // Wait for the virtual keyboard to open and visualViewport to update.
      window.setTimeout(() => scrollIntoSafeArea(target), 320);
    };

    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (!target?.matches?.(TYPING_SELECTOR)) return;
      if (blurTimer) window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        const active = document.activeElement;
        if (!active || !(active as Element).matches?.(TYPING_SELECTOR)) {
          removeSpacerSmooth();
        }
      }, SPACER_REMOVE_DELAY);
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
      const spacer = document.getElementById(SPACER_ID);
      if (spacer) spacer.remove();
    };
  }, []);
}
