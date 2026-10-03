import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../lib/api";
import { acct, near } from "../lib/format";
import { Countdown, useWindowAnim } from "./Clock";
import { Mark } from "./Logo";
import { Avatar, Num } from "./ui";

const TICKS = 60;

/** True for the last minute of the window: one timer, flips once instead of re-rendering every second. */
function useUrgent(at: number) {
  const [u, setU] = useState(false);
  useEffect(() => {
    if (!at) return setU(false);
    const ms = (at - 60) * 1000 - Date.now();
    setU(ms <= 0 && at * 1000 > Date.now());
    if (ms <= 0) return;
    const t = setTimeout(() => setU(true), ms);
    return () => clearTimeout(t);
  }, [at]);
  return u;
}
type Ping = { key: string; who: string; q: number };

/**
 * The live window as an orbit: the ring lights up as the window runs out,
 * this window's DCAers circle the bean, and every buy sends a ripple.
 */
export function Orbit({ snap }: { snap: Snapshot }) {
  const { info } = snap;
  const open = info.started && info.nextRoundAt > 0;
  const anim = useWindowAnim(info.windowStart, info.nextRoundAt, open);
  const urgent = useUrgent(open ? info.nextRoundAt : 0);
  const crew = snap.board.next.slice(0, 12);
  const topN = info.rules.topN;

  const [pings, setPings] = useState<Ping[]>([]);
  const seen = useRef(snap.trades.at(-1)?.tx);
  useEffect(() => {
    const last = seen.current;
    const i = last ? snap.trades.findIndex((t) => t.tx === last) : -1;
    seen.current = snap.trades.at(-1)?.tx;
    if (!last || i < 0) return;
    const fresh = snap.trades.slice(i + 1).filter((t) => t.side === "buy").slice(-2);
    if (!fresh.length) return;
    const add = fresh.map((t) => ({ key: t.tx + t.w, who: t.w, q: t.q }));
    setPings((p) => [...p, ...add].slice(-3));
    const tm = setTimeout(() => setPings((p) => p.filter((x) => !add.includes(x))), 2600);
    return () => clearTimeout(tm);
  }, [snap.trades]);


  return (
    <div className={`orbit-card${urgent ? " urgent" : ""}`}>
      <div className="orbit-top">
        <span className="live-dot" />
        <span>{open ? `Window #${info.windowNo}` : "Warming up"}</span>
        {info.goldenStack > 0 && <span className="golden">Golden ×{info.goldenStack + 1}</span>}
        <span className="orbit-top-r">Top {topN} paid</span>
      </div>

      <div className="orbit-stage"><div className="orbit-box">
        <svg viewBox="0 0 340 340" className={`orbit-svg${open ? "" : " idle"}`} style={anim.style} aria-hidden>
          <defs>
            <linearGradient id="arc" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#00EC97" />
              <stop offset=".6" stopColor="#17D9D4" />
              <stop offset="1" stopColor="#9797FF" />
            </linearGradient>
            <radialGradient id="core" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#00EC97" stopOpacity=".22" />
              <stop offset="1" stopColor="#00EC97" stopOpacity="0" />
            </radialGradient>
            {/* used inside the rotated tick group, so it is already in that group's frame */}
            <mask id="lit-mask" maskUnits="userSpaceOnUse">
              <circle key={anim.key} cx="170" cy="170" r="164" pathLength={1} className="run-arc lit-mask" />
            </mask>
          </defs>
          <circle cx="170" cy="170" r="128" fill="url(#core)" />
          <circle cx="170" cy="170" r="150" className="orbit-ring" />
          {/* 60 radial ticks = one thick dashed circle; the lit copy is revealed by the running mask */}
          <g transform="rotate(-90 170 170)">
            <circle cx="170" cy="170" r="164" pathLength={TICKS} className="ticks" />
            <circle cx="170" cy="170" r="165" pathLength={TICKS / 5} className="ticks big" />
            <g mask="url(#lit-mask)">
              <circle cx="170" cy="170" r="164" pathLength={TICKS} className="ticks on" />
              <circle cx="170" cy="170" r="165" pathLength={TICKS / 5} className="ticks big on" />
            </g>
          </g>
          <g key={anim.key}>
            <circle cx="170" cy="170" r="150" pathLength={1} className="orbit-arc glow run-arc" stroke="url(#arc)" transform="rotate(-90 170 170)" />
            <circle cx="170" cy="170" r="150" pathLength={1} className="orbit-arc run-arc" stroke="url(#arc)" transform="rotate(-90 170 170)" />
          </g>
          {pings.map((p) => <circle key={p.key} className="orbit-ping" cx="170" cy="170" r="60" />)}
        </svg>

        <svg viewBox="0 0 340 340" className="orbit-spin" aria-hidden><circle cx="170" cy="170" r="112" className="orbit-ring dashed" /></svg>
        {open && <div key={anim.key} className="orbit-headwrap" style={anim.style} aria-hidden><i className="orbit-head" /></div>}

        <div className="orbit-crew" style={{ ["--n" as string]: Math.max(1, crew.length) }}>
          {crew.map((r, k) => (
            <span key={r.id} className={`crew${k < topN ? " paid" : ""}`} style={{ ["--i" as string]: k }} title={`${r.id} · #${k + 1}`}>
              <span className="crew-in"><Avatar id={r.id} size={26} /></span>
            </span>
          ))}
        </div>

        <div className="orbit-core">
          <div className="orbit-bean"><Mark size={104} shadow live /></div>
          <Countdown at={info.nextRoundAt} idle={!open} />
        </div>

        <div className="orbit-tags">
          {pings.map((p) => (
            <span key={p.key} className="ping-tag">{acct(p.who, 14)} <b>+{near(p.q, false)}</b></span>
          ))}
        </div>
      </div></div>

      <div className="orbit-stats">
        <div><small>Vault</small><Num v={info.pool} fmt={(n) => near(n)} /></div>
        <div><small>DCAing</small><b>{info.dcaingNow}</b></div>
        <div><small>At risk</small><b>{info.atRisk}</b></div>
      </div>
    </div>
  );
}
