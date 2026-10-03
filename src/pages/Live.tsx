import { useMemo, useState } from "react";

import { PriceChart } from "../components/PriceChart";
import { AppLink, Avatar, Card, Empty, PageHead, StatusPill, Streak } from "../components/ui";
import { useLive, type Status } from "../lib/api";
import { acct, ago, near } from "../lib/format";
import { Clock } from "../components/Clock";
import { useNow } from "../lib/hooks";

type Trader = { id: string; buys: number; sells: number; bought: number; sold: number; last: number; status: Status | null; streak: number };

export default function Live() {
  const { snap } = useLive();
  const now = useNow();
  const [tab, setTab] = useState<"dca" | "all">("dca");
  const [side, setSide] = useState<"all" | "buy" | "sell">("all");

  // every wallet that traded in the last 24h, with what we know about its streak
  const traders = useMemo<Trader[]>(() => {
    if (!snap) return [];
    const st = new Map([...snap.board.streaks, ...snap.board.next].map((r) => [r.id, r]));
    const m = new Map<string, Trader>();
    for (const t of snap.trades) {
      const x = m.get(t.w) ?? { id: t.w, buys: 0, sells: 0, bought: 0, sold: 0, last: 0, status: st.get(t.w)?.status ?? null, streak: st.get(t.w)?.liveStreak ?? 0 };
      if (t.side === "buy") (x.buys += 1), (x.bought += t.q);
      else (x.sells += 1), (x.sold += t.q), (x.status = "out");
      x.last = Math.max(x.last, t.t);
      m.set(t.w, x);
    }
    return [...m.values()].sort((a, b) => b.last - a.last);
  }, [snap]);

  if (!snap) return <div className="card skeleton" style={{ height: 420 }} />;
  const i = snap.info;
  const span = Math.max(1, i.nextRoundAt - i.windowStart);
  const prog = i.started ? Math.min(1, (now - i.windowStart) / span) : 0;
  const dcaers = snap.board.next;

  return (
    <>
      <PageHead kicker="Live" title="Who's DCAing">
        <div className="window-pill">
          <span className="live-dot" />
          <span>{i.started ? `#${i.windowNo}` : "soon"}</span>
          <Clock left={Math.max(0, i.nextRoundAt - now)} size="sm" idle={!i.started} />
          <div className="wbar"><i style={{ width: `${prog * 100}%` }} /></div>
        </div>
      </PageHead>

      <PriceChart snap={snap} />

      <section className="duo wide-left">
        <Card
          title={<span className="seg-title">{tab === "dca" ? `DCAing · #${i.windowNo}` : "Traders · 24h"}</span>}
          action={
            <div className="seg" role="tablist">
              <button role="tab" aria-selected={tab === "dca"} className={tab === "dca" ? "on" : ""} onClick={() => setTab("dca")}>DCAing <em>{dcaers.length}</em></button>
              <button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>All <em>{traders.length}</em></button>
            </div>
          }
        >
          {tab === "dca" ? (
            dcaers.length ? (
              <div className="table-scroll">
                <table className="tbl">
                  <thead><tr><th>#</th><th>Wallet</th><th>Streak</th><th className="r">This window</th><th className="r">Est.</th></tr></thead>
                  <tbody>
                    {dcaers.map((r, k) => (
                      <tr key={r.id} className={k < i.rules.topN ? "paid" : "dim"}>
                        <td className="muted">{k + 1}</td>
                        <td><AppLink to={`/wallet/${r.id}`} className="who"><Avatar id={r.id} size={22} /><span className="mono">{acct(r.id, 20)}</span></AppLink></td>
                        <td><Streak n={r.liveStreak} /></td>
                        <td className="r">{near(r.windowBuy)}</td>
                        <td className="r"><b>{near(r.est)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="Nobody this window" hint={`≥ ${i.rules.minBuy} NEAR gets you in`} />
            )
          ) : traders.length ? (
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>Wallet</th><th>Status</th><th className="r">In</th><th className="r hide-sm">Out</th><th className="r">Last</th></tr></thead>
                <tbody>
                  {traders.slice(0, 100).map((t) => (
                    <tr key={t.id}>
                      <td><AppLink to={`/wallet/${t.id}`} className="who"><Avatar id={t.id} size={22} /><span className="mono">{acct(t.id, 20)}</span></AppLink></td>
                      <td>{t.status ? <StatusPill s={t.status} /> : <span className="muted">–</span>}{t.streak > 0 && <> <Streak n={t.streak} size={12} /></>}</td>
                      <td className="r">{near(t.bought)} <small className="muted">×{t.buys}</small></td>
                      <td className="r hide-sm">{t.sells ? near(t.sold) : <span className="muted">–</span>}</td>
                      <td className="r muted">{ago(t.last, now)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No trades in 24h" />
          )}
        </Card>

        <Card
          title="Tape"
          action={
            <div className="seg" role="tablist" aria-label="Show">
              {(["all", "buy", "sell"] as const).map((s) => (
                <button key={s} role="tab" aria-selected={side === s} className={side === s ? "on" : ""} onClick={() => setSide(s)}>{s === "all" ? "All" : s === "buy" ? "Buys" : "Sells"}</button>
              ))}
            </div>
          }
        >
          {snap.trades.length ? (
            <ul className="feed tall">
              {snap.trades.filter((t) => side === "all" || t.side === side).slice(-40).reverse().map((t) => (
                <li key={t.tx + t.w} className={t.side}>
                  <span className={`side ${t.side}`}>{t.side === "buy" ? "Buy" : "Sell"}</span>
                  <AppLink to={`/wallet/${t.w}`} className="mono">{acct(t.w, 16)}</AppLink>
                  <b>{near(t.q)}</b>
                  <small className="muted">{ago(t.t, now)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Quiet cup" />
          )}
        </Card>
      </section>
    </>
  );
}
