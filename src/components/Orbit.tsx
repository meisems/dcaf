import { useEffect, useRef, useState } from "react";
import { LINKS, SYMBOL } from "../config";
import { paidCount, type Snapshot } from "../lib/api";
import { acct, clock, near } from "../lib/format";
import { useNow } from "../lib/hooks";
import { Clock, useWindowAnim } from "./Clock";
import { ArrowRight } from "./Icons";
import { Mark } from "./Logo";
import { Avatar, Num, useUi } from "./ui";

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
  const cut = paidCount(info.rules);

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
        <span className="orbit-top-r">{info.rules.topN > 0 ? `Top ${info.rules.topN} paid` : "Every DCAer paid"}</span>
      </div>

      <div className="orbit-stage"><div className="orbit-box">
        <svg viewBox="0 0 340 340" className={`orbit-svg${open ? "" : " idle"}`} style={anim.style} aria-hidden>
          <defs>
            <linearGradient id="arc" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FFC83D" />
              <stop offset=".6" stopColor="#FF8A3D" />
              <stop offset="1" stopColor="#F472B6" />
            </linearGradient>
            <radialGradient id="core" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#FFC83D" stopOpacity=".22" />
              <stop offset="1" stopColor="#FFC83D" stopOpacity="0" />
            </radialGradient>
            {/* used inside the rotated tick group, so it is already in that group's frame */}
            <mask id="lit-mask" maskUnits="userSpaceOnUse">
              <circle key={anim.key} cx="170" cy="170" r="164" pathLength={1} className="run-arc lit-mask" />
            </mask>
          </defs>
          <circle cx="170" cy="170" r="128" fill="url(#core)" />
          <circle cx="170" cy="170" r="150" className="orbit-ring" />
          {/* before the first round: the ring fills with holders instead of time */}
          {!info.started && (
            <circle cx="170" cy="170" r="150" pathLength={1} className="orbit-arc holders" stroke="url(#arc)" transform="rotate(-90 170 170)"
              strokeDasharray={`${Math.min(1, info.holders / Math.max(1, info.rules.minHolders))} 1`} />
          )}
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
            <span key={r.id} className={`crew${k < cut ? " paid" : ""}`} style={{ ["--i" as string]: k }} title={`${r.id} · #${k + 1}`}>
              <span className="crew-in"><Avatar id={r.id} size={26} /></span>
            </span>
          ))}
        </div>

        <div className="orbit-core">
          <div className="orbit-bean"><Mark size={84} shadow live /></div>
          <Core snap={snap} open={open} />
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
        <div><small>Holders</small><b>{info.holders}</b></div>
      </div>
    </div>
  );
}

/** The middle of the orbit: what is counting down, until when, and where you stand. */
function Core({ snap, open }: { snap: Snapshot; open: boolean }) {
  const { info } = snap;
  const now = useNow();
  const { mine } = useUi();
  const R = info.rules;
  if (!info.started)
    return (
      <div className="core">
        <span className="core-label">Waiting for holders</span>
        <span className="core-big">{info.holders}<small>/{R.minHolders}</small></span>
        <span className="core-sub">The first round starts at {R.minHolders} holders</span>
      </div>
    );
  const left = open ? Math.max(0, info.nextRoundAt - now) : 0;
  const last = left > 0 && left <= 60;
  const inRound = mine?.status === "dcaing";
  return (
    <div className={`core${last ? " last" : ""}`}>
      <span className="core-label">{left === 0 ? `Round #${info.windowNo} closing` : last ? "Last call" : `Round #${info.windowNo} closes in`}</span>
      <Clock left={left} />
      {left > 0 && <span className="core-sub">at {clock(info.nextRoundAt)}</span>}
      {inRound ? (
        <span className="core-chip in">✓ You're in this round</span>
      ) : last ? (
        <a className="core-buy" href={LINKS.buy} target="_blank" rel="noreferrer">Buy ${SYMBOL} now <ArrowRight size={14} /></a>
      ) : mine && mine.status !== "out" ? (
        <span className="core-chip">Buy ≥ {R.minBuy} NEAR to join</span>
      ) : null}
    </div>
  );
}
