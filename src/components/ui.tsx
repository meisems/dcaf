import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { prefetchWallet, type WalletReport } from "../lib/api";
import { prefetchPath } from "../lib/prefetch";
import type { Status } from "../lib/api";
import { Flame } from "./Icons";

// ---------------------------------------------------------------- app-wide UI actions

type Ui = { openSearch: () => void; mine: WalletReport | null };
export const UiCtx = createContext<Ui>({ openSearch: () => {}, mine: null });
export const useUi = () => useContext(UiCtx);

// ---------------------------------------------------------------- links that are already there

/** Internal link: animated page transition, and the target warmed up on hover/touch/focus. */
export function AppLink({ to, onMouseEnter, onFocus, onTouchStart, ...rest }: LinkProps & { to: string }) {
  const warm = () => {
    prefetchPath(to);
    if (to.startsWith("/wallet/")) prefetchWallet(decodeURIComponent(to.slice(8)));
  };
  return (
    <Link
      to={to}
      viewTransition
      onMouseEnter={(e) => (warm(), onMouseEnter?.(e))}
      onFocus={(e) => (warm(), onFocus?.(e))}
      onTouchStart={(e) => (warm(), onTouchStart?.(e))}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------- numbers that glide

export function Num({ v, fmt, className }: { v: number; fmt: (n: number) => string; className?: string }) {
  const [shown, setShown] = useState(v);
  const from = useRef(v);
  useEffect(() => {
    const a = from.current;
    if (a === v || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = v;
      return setShown(v);
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(a + (v - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = v;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <span className={className}>{fmt(shown)}</span>;
}

// ---------------------------------------------------------------- small pieces

export const Streak = ({ n, size = 13 }: { n: number; size?: number }) => (
  <span className="streak"><Flame size={size} />{n}</span>
);

const PILL: Record<Status, [string, string]> = {
  dcaing: ["DCAing", "good"],
  waiting: ["At risk", "warn"],
  notyet: ["Warming up", "info"],
  idle: ["Idle", "info"],
  out: ["Out", "bad"],
};
export const StatusPill = ({ s }: { s: Status }) => <span className={`pill pill-${PILL[s][1]}`}>{PILL[s][0]}</span>;

export function hue(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}
export const Avatar = ({ id, size = 26 }: { id: string; size?: number }) => (
  <span className="avatar" style={{ ["--h" as string]: hue(id), width: size, height: size }} />
);

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-h">
          {title && <h2>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export const More = ({ to, children }: { to: string; children: ReactNode }) => (
  <AppLink to={to} className="more-link">{children} <span aria-hidden>→</span></AppLink>
);

/** Friendly empty state: a bean outline with an orbiting node. */
export function Empty({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r="28" className="empty-ring" />
        <ellipse cx="32" cy="32" rx="11" ry="15" transform="rotate(32 32 32)" className="empty-bean" />
        <path d="M27 38.5v-2.2h3.6v-4.3h3.6v-4.3h3.6v-2.2" className="empty-bean" />
        <circle cx="32" cy="4" r="2.4" className="empty-node" />
      </svg>
      <b>{title}</b>
      {hint && <span>{hint}</span>}
      {children}
    </div>
  );
}

export function PageHead({ kicker, title, children }: { kicker?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-h">
      <div>
        {kicker && <span className="kicker">{kicker}</span>}
        <h1>{title}</h1>
      </div>
      {children}
    </header>
  );
}
