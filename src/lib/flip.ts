import { useLayoutEffect, useRef } from "react";

/**
 * FLIP for lists: children marked data-flip="key" glide from their old position to the new one
 * when the list re-orders, and newcomers flash in. Positions are relative to the container,
 * so scrolling never triggers it.
 */
export function useFlip<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  const prev = useRef<Map<string, number> | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    el.querySelectorAll<HTMLElement>("[data-flip]").forEach((n) => {
      const k = n.dataset.flip!;
      const top = n.offsetTop;
      next.set(k, top);
      if (reduced || !prev.current) return;
      const before = prev.current.get(k);
      if (before === undefined) n.animate([{ backgroundColor: "rgba(0, 236, 151, 0.16)" }, { backgroundColor: "transparent" }], { duration: 1400, easing: "ease-out" });
      else if (Math.abs(before - top) > 1)
        n.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], { duration: 520, easing: "cubic-bezier(.2, .8, .2, 1)" });
    });
    prev.current = next;
  }, [dep]);
  return ref;
}
