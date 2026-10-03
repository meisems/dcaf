import { useEffect, useState, useSyncExternalStore } from "react";
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

// ---------------------------------------------------------------- theme (one store, any caller)

export type Theme = "light" | "dark";
type VTDoc = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };

const themeSubs = new Set<() => void>();
const readTheme = (): Theme => (document.documentElement.dataset.theme as Theme) || "dark";

function applyTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "light" ? "#F3F6F5" : "#050607");
  try {
    localStorage.setItem("dcaf-theme", next);
  } catch {
    /* ignore */
  }
  themeSubs.forEach((f) => f());
}

/**
 * Flip the theme with a circular reveal growing out of `at` (the toggle, or the screen corner),
 * using the View Transitions API, with a plain swap where that isn't supported.
 */
export function toggleTheme(at?: { clientX: number; clientY: number }) {
  const next: Theme = readTheme() === "dark" ? "light" : "dark";
  const doc = document as VTDoc;
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return applyTheme(next);
  const x = at?.clientX || window.innerWidth - 80;
  const y = at?.clientY || 40;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const root = document.documentElement;
  root.classList.add("vt-theme");
  const t = doc.startViewTransition(() => applyTheme(next));
  void t.finished.finally(() => root.classList.remove("vt-theme"));
  void t.ready.then(() =>
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 720, easing: "cubic-bezier(.7, 0, .2, 1)", pseudoElement: "::view-transition-new(root)" },
    ),
  );
}

export function useTheme(): [Theme, typeof toggleTheme] {
  const theme = useSyncExternalStore((f) => (themeSubs.add(f), () => void themeSubs.delete(f)), readTheme);
  return [theme, toggleTheme];
}
