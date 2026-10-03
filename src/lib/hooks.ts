import { useEffect, useSyncExternalStore } from "react";
import { nowS } from "./format";

// ---------------------------------------------------------------- one clock for the whole app
// A single timer, aligned to the wall-clock second, so every countdown ticks in the same frame
// (one render pass a second instead of one per component, drifting apart).
const nowSubs = new Set<() => void>();
let nowV = nowS();
let nowT: ReturnType<typeof setTimeout> | null = null;
function tick() {
  nowV = nowS();
  nowSubs.forEach((f) => f());
  nowT = setTimeout(tick, 1000 - (Date.now() % 1000) + 4);
}
function subNow(f: () => void) {
  nowSubs.add(f);
  if (!nowT) (nowV = nowS()), (nowT = setTimeout(tick, 1000 - (Date.now() % 1000) + 4));
  return () => {
    nowSubs.delete(f);
    if (!nowSubs.size && nowT) clearTimeout(nowT), (nowT = null);
  };
}

/** Current unix second. Only the component that calls it re-renders each second, so keep callers small. */
export const useNow = () => useSyncExternalStore(subNow, () => nowV);

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

// ---------------------------------------------------------------- page name for the browser tab
const nameSubs = new Set<() => void>();
let pageName = "";
const setPageName = (n: string) => {
  if (n === pageName) return;
  pageName = n;
  nameSubs.forEach((f) => f());
};

/** Names the current page in the browser tab (the shell adds the countdown and brand). */
export function usePageName(name: string) {
  useEffect(() => {
    setPageName(name);
    return () => {
      if (pageName === name) setPageName("");
    };
  }, [name]);
}

export const useCurrentPageName = () => useSyncExternalStore((f) => (nameSubs.add(f), () => void nameSubs.delete(f)), () => pageName);
