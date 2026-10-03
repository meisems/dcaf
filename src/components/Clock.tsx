import { useEffect, useState } from "react";

/** One digit as a rolling strip 0–9: changes slide instead of snapping. */
function Digit({ d }: { d: number }) {
  return (
    <span className="dg" aria-hidden>
      <span className="dg-strip" style={{ transform: `translateY(${-d * 10}%)` }}>
        {Array.from({ length: 10 }, (_, i) => <span key={i}>{i}</span>)}
      </span>
    </span>
  );
}

/** mm:ss with rolling digits and unit labels. Below 60s it turns hot, at 0 it shows the payout state. */
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

/** Fractional unix time on every animation frame (throttled), for rings that glide instead of tick. */
export function useSmoothNow(fps = 30) {
  const [t, setT] = useState(() => Date.now() / 1000);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      if (ts - last > 1000 / fps) {
        last = ts;
        setT(Date.now() / 1000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps]);
  return t;
}
