import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([type="hidden"]):not([disabled])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const visible = (node) =>
  node.offsetWidth > 0 || node.offsetHeight > 0 || node.getClientRects().length > 0;

/**
 * Keeps the keyboard inside an open dialog: focus moves to the first control
 * (or `initialFocusRef`), Tab and Shift+Tab wrap at the edges, Escape asks the
 * caller to close, and the trigger gets its focus back afterwards. One hook for
 * every writing dialog, so the trap can never be right on one surface and
 * missing on the other.
 */
export default function useFocusTrap({
  active,
  containerRef,
  initialFocusRef = null,
  onEscape,
}) {
  // Escape must call the latest handler without re-running the focus effect,
  // which would steal focus back to the first control on every keystroke.
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;
    const previous = document.activeElement;

    const nodes = () => Array.from(container.querySelectorAll(FOCUSABLE)).filter(visible);
    const first = initialFocusRef?.current || nodes()[0] || container;
    first.focus?.();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        escapeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const all = nodes();
      if (!all.length) {
        event.preventDefault();
        container.focus?.();
        return;
      }
      const head = all[0];
      const tail = all[all.length - 1];
      const current = document.activeElement;
      if (!container.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? tail : head).focus();
        return;
      }
      if (event.shiftKey && current === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && current === tail) {
        event.preventDefault();
        head.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, [active, containerRef, initialFocusRef]);
}
