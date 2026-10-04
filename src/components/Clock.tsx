import { memo, useMemo } from "react";
import { useNow } from "../lib/hooks";

/** One digit. A new value drops in from above, so 0 → 9 is one step like any other (no wrap-around scroll). */
const Digit = memo(function Digit({ d }: { d: number }) {
  return (
    <span className="dg" aria-hidden>
      <span key={d} className="dg-n">{d}</span>
    </span>
  );
});

/** mm:ss with easing digits and unit labels. Below 60s it turns hot, at 0 it shows the payout state. */
export function Clock({ left, size = "lg", idle = false }: { left: number; size?: "lg" | "sm"; idle?: boolean }) {
  const s = Math.max(0, Math.floor(left));
  const m = Math.min(99, Math.floor(s / 60));
  const sec = s % 60;
  if (idle) return <span className={`clock clock-${size} idle`} aria-label="not started"><b>--</b><i className="colon">:</i><b>--</b></span>;
  if (s === 0)
    return (
      <span className={`clock clock-${size} paying`} aria-label="paying out">
        Paying<span className="dots"><i /><i /><i /></span>
      </span>
    );
  return (
    <span className={`clock clock-${size}${s <= 60 ? " hot" : ""}${s <= 10 ? " final" : ""}`} role="timer" aria-label={`${m} minutes ${sec} seconds`}>
      <span className="clock-g">
        <span className="clock-d"><Digit d={Math.floor(m / 10)} /><Digit d={m % 10} /></span>
        {size === "lg" && <small>min</small>}
      </span>
      <i className="colon">:</i>
      <span className="clock-g">
        <span className="clock-d"><Digit d={Math.floor(sec / 10)} /><Digit d={sec % 10} /></span>
        {size === "lg" && <small>sec</small>}
      </span>
    </span>
  );
}

/** A Clock counting down to `at` on the shared second. */
export const Countdown = memo(function Countdown({ at, size, idle }: { at: number; size?: "lg" | "sm"; idle?: boolean }) {
  return <Clock left={Math.max(0, at - useNow())} size={size} idle={idle} />;
});

/**
 * CSS variables that let a ring animate the whole window on the compositor:
 * duration = window length, negative delay = time already elapsed. Fixed per window,
 * so re-renders never restart or jitter the animation; `key` remounts it on a new window.
 */
export function useWindowAnim(windowStart: number, closeAt: number, open: boolean) {
  const key = `${windowStart}:${closeAt}:${open}`;
  const style = useMemo(() => {
    const span = Math.max(1, closeAt - windowStart);
    const elapsed = Math.min(span, Math.max(0, Date.now() / 1000 - windowStart));
    return { ["--span" as string]: `${span}s`, ["--delay" as string]: `${-elapsed}s`, ["--steps" as string]: Math.round(span * 2) };
  }, [key]);
  return { key, style };
}
