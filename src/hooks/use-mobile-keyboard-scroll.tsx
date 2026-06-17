import { useEffect } from "react";

/**
 * Global mobile UX helper: when a text-like field receives focus on a small
 * screen, scroll it into the visible area above the virtual keyboard, keeping
 * a safety margin so dropdowns/option lists remain readable.
 */
export function useMobileKeyboardScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

    const TYPING_SELECTOR =
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]),textarea,[contenteditable="true"],[role="combobox"],[role="searchbox"]';

    const SAFE_MARGIN = 120;

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

    const handleFocusIn = (e: FocusEvent) => {
      if (!isMobile()) return;
      const target = e.target as Element | null;
      if (!target) return;
      if (!target.matches?.(TYPING_SELECTOR)) return;

      // Wait for the virtual keyboard to open and the visualViewport to update.
      window.setTimeout(() => scrollIntoSafeArea(target), 300);
    };

    document.addEventListener("focusin", handleFocusIn);

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
      vv?.removeEventListener("resize", handleViewportResize);
    };
  }, []);
}
