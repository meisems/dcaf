import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../lib/api";
import { acct, near } from "../lib/format";
import { Clock, useSmoothNow } from "./Clock";
import { Mark } from "./Logo";
import { Avatar } from "./ui";

const TICKS = 60;
type Ping = { key: string; who: string; q: number };

/**
 * The live window as an orbit: the ring lights up as the window runs out,
 * this window's DCAers circle the bean, and every buy sends a ripple.
 */
export function Orbit({ snap }: { snap: Snapshot }) {
  const now = useSmoothNow(30); // fractional seconds: the ring glides
  const { info } = snap;
  const open = info.started && info.nextRoundAt > 0;
  const span = Math.max(1, info.nextRoundAt - info.windowStart);
  const left = Math.max(0, Math.ceil(info.nextRoundAt - now));
  const prog = open ? Math.min(1, Math.max(0, (now - info.windowStart) / span)) : 0;
  const lit = Math.round(prog * TICKS);
  const urgent = open && left <= 60;
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

  // arc of the elapsed window, starting at 12 o'clock
  const R = 150;
  const C = 2 * Math.PI * R;

  return (
    <div className={`orbit-card${urgent ? " urgent" : ""}`}>
      <div className="orbit-top">
        <span className="live-dot" />
        <span>{open ? `Window #${info.windowNo}` : "Warming up"}</span>
        {info.goldenStack > 0 && <span className="golden">Golden ×{info.goldenStack + 1}</span>}
        <span className="orbit-top-r">Top {topN} paid</span>
      </div>

      <div className="orbit-stage"><div className="orbit-box">
        <svg viewBox="0 0 340 340" className="orbit-svg" aria-hidden>
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
          </defs>
          <circle cx="170" cy="170" r="128" fill="url(#core)" />
          <circle cx="170" cy="170" r="112" className="orbit-ring dashed" />
          <circle cx="170" cy="170" r={R} className="orbit-ring" />
          {Array.from({ length: TICKS }, (_, k) => {
            const a = (k / TICKS) * 2 * Math.PI - Math.PI / 2;
            const big = k % 5 === 0;
            const r1 = 160, r2 = big ? 170 : 166;
            return (
              <line key={k} x1={170 + r1 * Math.cos(a)} y1={170 + r1 * Math.sin(a)} x2={170 + r2 * Math.cos(a)} y2={170 + r2 * Math.sin(a)}
                className={`tick${k < lit ? " on" : ""}${big ? " big" : ""}`} />
            );
          })}
          <circle cx="170" cy="170" r={R} className="orbit-arc" stroke="url(#arc)" strokeDasharray={`${C * prog} ${C}`} transform="rotate(-90 170 170)" />
          {open && <circle className="orbit-head" r="5" cx={170 + R * Math.cos(prog * 2 * Math.PI - Math.PI / 2)} cy={170 + R * Math.sin(prog * 2 * Math.PI - Math.PI / 2)} />}
          {pings.map((p) => <circle key={p.key} className="orbit-ping" cx="170" cy="170" r="60" />)}
        </svg>

        <div className="orbit-crew" style={{ ["--n" as string]: Math.max(1, crew.length) }}>
          {crew.map((r, k) => (
            <span key={r.id} className={`crew${k < topN ? " paid" : ""}`} style={{ ["--i" as string]: k }} title={`${r.id} · #${k + 1}`}>
              <span className="crew-in"><Avatar id={r.id} size={26} /></span>
            </span>
          ))}
        </div>

        <div className="orbit-core">
          <div className="orbit-bean"><Mark size={104} shadow live /></div>
          <Clock left={left} idle={!open} />
        </div>

        <div className="orbit-tags">
          {pings.map((p) => (
            <span key={p.key} className="ping-tag">{acct(p.who, 14)} <b>+{near(p.q, false)}</b></span>
          ))}
        </div>
      </div></div>

      <div className="orbit-stats">
        <div><small>Vault</small><b>{near(info.pool)}</b></div>
        <div><small>DCAing</small><b>{info.dcaingNow}</b></div>
        <div><small>At risk</small><b>{info.atRisk}</b></div>
      </div>
    </div>
  );
}
