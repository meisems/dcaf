import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { nowS } from "./format";

/** Current unix second, re-rendering once a second. */
export function useNow() {
  const [n, setN] = useState(nowS);
  useEffect(() => {
    const t = setInterval(() => setN(nowS()), 1000);
    return () => clearInterval(t);
  }, []);
  return n;
}

export type Theme = "light" | "dark";
type VTDoc = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };

/**
 * Theme with a circular reveal: the new theme grows out of the toggle
 * (View Transitions API), with a plain swap where that isn't supported.
 */
export function useTheme(): [Theme, (at?: { clientX: number; clientY: number }) => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || "dark");

  const toggle = (at?: { clientX: number; clientY: number }) => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const apply = () => {
      document.documentElement.dataset.theme = next;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "light" ? "#F3F6F5" : "#050607");
      try {
        localStorage.setItem("dcaf-theme", next);
      } catch {
        /* ignore */
      }
      flushSync(() => setTheme(next));
    };
    const doc = document as VTDoc;
    if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
    const x = at?.clientX || window.innerWidth - 80;
    const y = at?.clientY || 40;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const root = document.documentElement;
    root.classList.add("vt-theme");
    const t = doc.startViewTransition(apply);
    void t.finished.finally(() => root.classList.remove("vt-theme"));
    void t.ready.then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 720, easing: "cubic-bezier(.7, 0, .2, 1)", pseudoElement: "::view-transition-new(root)" },
      ),
    );
  };
  return [theme, toggle];
}
