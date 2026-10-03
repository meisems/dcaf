import { useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot, Trade } from "../lib/api";
import { Empty } from "./ui";
import { acct, clockS, near, price, usd } from "../lib/format";

const RANGES = [
  { k: "15M", s: 900 },
  { k: "1H", s: 3600 },
  { k: "6H", s: 21600 },
  { k: "24H", s: 86400 },
];

const H = 300;
const PAD = { l: 8, r: 64, t: 18, b: 28 };

export function PriceChart({ snap }: { snap: Snapshot }) {
  const [range, setRange] = useState(RANGES[1]);
  const [hover, setHover] = useState<Trade | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(800);

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const { info } = snap;
  const end = snap.trades.at(-1)?.t ?? info.windowStart;
  const now = Math.max(end, Math.floor(Date.now() / 1000));
  const from = now - range.s;
  const pts = useMemo(() => snap.trades.filter((t) => t.t >= from), [snap.trades, from]);
  const prev = useMemo(() => [...snap.trades].reverse().find((t) => t.t < from), [snap.trades, from]);

  const u = info.usdPerNear;
  const sup = info.supply;
  // market cap when supply is known, otherwise plain price
  const mcLabel = (p: number) => (sup ? (u ? usd(p * sup * u) : near(p * sup)) : `${price(p)}`);

  const geo = useMemo(() => {
    const series = prev ? [{ ...prev, t: from }, ...pts] : pts;
    if (!series.length) return null;
    // robust range: ignore the extreme 2% so one odd fill can't flatten the chart
    const ps = series.map((t) => t.p).filter((p) => p > 0).sort((a, b) => a - b);
    const q = (f: number) => ps[Math.min(ps.length - 1, Math.max(0, Math.floor(f * (ps.length - 1))))];
    let lo = ps.length > 20 ? q(0.02) : ps[0];
    let hi = ps.length > 20 ? q(0.98) : ps[ps.length - 1];
    if (hi === lo) (hi *= 1.01), (lo *= 0.99);
    const padY = (hi - lo) * 0.12;
    lo -= padY;
    hi += padY;
    const x = (t: number) => PAD.l + ((t - from) / (now - from)) * (W - PAD.l - PAD.r);
    const y = (p: number) => PAD.t + (1 - (Math.min(hi, Math.max(lo, p)) - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    // step line: price holds until the next trade
    let d = `M${x(series[0].t)},${y(series[0].p)}`;
    for (let i = 1; i < series.length; i++) d += `H${x(series[i].t)}V${y(series[i].p)}`;
    d += `H${x(now)}`;
    const area = `${d}V${H - PAD.b}H${x(series[0].t)}Z`;
    const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * (i + 0.5)) / 4);
    const tTicks = [0.12, 0.37, 0.62, 0.87].map((f) => from + f * (now - from));
    return { x, y, d, area, ticks, tTicks };
  }, [pts, prev, from, now, W]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!geo || !pts.length) return;
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W;
    let best = pts[0];
    let bd = Infinity;
    for (const t of pts) {
      const dd = Math.abs(geo.x(t.t) - mx);
      if (dd < bd) (bd = dd), (best = t);
    }
    setHover(bd < 40 ? best : null);
  };

  const last = snap.trades.at(-1);
  const first = pts[0] ?? prev;
  const chg = last && first ? last.p / first.p - 1 : 0;
  const winX = geo && info.windowStart > from ? geo.x(info.windowStart) : null;

  return (
    <div className="card chart-card">
      <div className="chart-head">
        <div>
          <small className="label">${info.symbol} {sup ? "market cap" : "price · NEAR"}</small>
          <div className="chart-big">
            <b>{info.price ? mcLabel(info.price) : "–"}</b>
            <span className={chg >= 0 ? "up" : "down"}>{chg >= 0 ? "▲" : "▼"} {(Math.abs(chg) * 100).toFixed(2)}% · {range.k}</span>
          </div>
          {sup && info.price ? <small className="muted mono">{price(info.price)} NEAR</small> : null}
        </div>
        <div className="seg" role="tablist" aria-label="Chart range">
          {RANGES.map((r) => (
            <button key={r.k} role="tab" aria-selected={r.k === range.k} className={r.k === range.k ? "on" : ""} onClick={() => setRange(r)}>
              {r.k}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-box" ref={box}>
        {geo ? (
          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
            aria-label={`${info.symbol} over the last ${range.k}`}>
            <defs>
              <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--accent)" stopOpacity=".22" />
                <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {geo.ticks.map((p) => (
              <g key={p}>
                <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(p)} y2={geo.y(p)} className="grid" />
                <text x={W - PAD.r + 10} y={geo.y(p) + 4} className="axis">{mcLabel(p)}</text>
              </g>
            ))}
            {geo.tTicks.map((t) => (
              <text key={t} x={geo.x(t)} y={H - 8} className="axis" textAnchor="middle">
                {new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </text>
            ))}
            {winX !== null && (
              <g>
                <rect x={winX} y={PAD.t} width={Math.max(0, W - PAD.r - winX)} height={H - PAD.t - PAD.b} className="win-band" />
                <text x={winX + 6} y={PAD.t + 12} className="axis strong">window #{info.windowNo}</text>
              </g>
            )}
            <path d={geo.area} fill="url(#area)" />
            <path d={geo.d} className="line" />
            {pts.map((t) => {
              const inWin = t.side === "buy" && t.t >= info.windowStart;
              return (
                <circle key={t.tx} cx={geo.x(t.t)} cy={geo.y(t.p)} r={t.side === "sell" ? 4 : inWin ? 4.5 : 3}
                  className={t.side === "sell" ? "pt-sell" : inWin ? "pt-in" : "pt-old"} />
              );
            })}
            {hover && (
              <g className="cross">
                <line x1={geo.x(hover.t)} x2={geo.x(hover.t)} y1={PAD.t} y2={H - PAD.b} />
                <circle cx={geo.x(hover.t)} cy={geo.y(hover.p)} r={7} className="cross-dot" />
              </g>
            )}
          </svg>
        ) : (
          <Empty title="No trades yet" hint={`Last ${range.k}`} />
        )}
        {hover && geo && (
          <div className="tip" style={{ left: `${(geo.x(hover.t) / W) * 100}%`, top: geo.y(hover.p) }}>
            <b className="mono">{acct(hover.w, 20)}</b>
            <span>
              {hover.side === "sell" ? "sold" : "bought"} <b>{near(hover.q)}</b>
            </span>
            <span className="muted">{clockS(hover.t)} · MC {mcLabel(hover.p)}</span>
          </div>
        )}
      </div>

      <div className="legend">
        <span><i className="lg lg-in" /> this window</span>
        <span><i className="lg lg-old" /> earlier buy</span>
        <span><i className="lg lg-sell" /> sell</span>
      </div>
    </div>
  );
}
