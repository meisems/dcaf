import { Link } from "react-router";
import { LINKS, SYMBOL } from "../config";
import { ArrowRight, Bean, Coins, Flame, Lock, Users, Vault } from "../components/Icons";
import { Orbit } from "../components/Orbit";
import { Avatar, Card, Empty, More, Num, Streak } from "../components/ui";
import { useLive, type Snapshot } from "../lib/api";
import { acct, ago, near, usd } from "../lib/format";
import { useNow } from "../lib/hooks";

export default function Home() {
  const { snap } = useLive();
  const now = useNow();
  const i = snap?.info;
  const R = i?.rules;

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="chip chip-live"><span className="live-dot" /> Live on NEAR</span>
          <h1>
            DCA.
            <br />
            <span className="grad-text">No jitters.</span>
          </h1>
          <p className="lead">Buy every window. Top {R?.topN ?? 10} get paid, automatically.</p>
          <div className="cta">
            <a className="btn btn-grad btn-lg" href={LINKS.buy} target="_blank" rel="noreferrer">Buy ${SYMBOL} <ArrowRight size={18} /></a>
            <Link className="btn btn-soft btn-lg" to="/me">My streak</Link>
          </div>
          <span className="no-connect"><i />No wallet connect · tracked on-chain</span>
        </div>
        <div className="hero-orbit">{snap ? <Orbit snap={snap} /> : <div className="orbit-card skeleton" />}</div>
      </section>

      {snap && snap.trades.length > 0 && <Tape snap={snap} now={now} />}

      <section className="kpis">
        <Kpi icon={<Vault size={18} />} label="Vault" v={i?.pool ?? 0} fmt={(n) => near(n)} sub={i?.usdPerNear ? usd((i.pool ?? 0) * i.usdPerNear) : undefined} hot />
        <Kpi icon={<Users size={18} />} label="DCAing now" v={i?.dcaingNow ?? 0} fmt={(n) => Math.round(n).toString()} sub={i ? `${i.wallets} traders` : undefined} />
        <Kpi icon={<Flame size={18} />} label="Top streak" v={i?.topStreak ?? 0} fmt={(n) => Math.round(n).toString()} sub="windows" />
        <Kpi icon={<Coins size={18} />} label="Paid out" v={i?.totalPaid ?? 0} fmt={(n) => near(n)} sub={i ? `${i.roundsRun} rounds` : undefined} />
      </section>

      <ol className="flow">
        <Step n="01" icon={<Bean size={20} />} t={`≥ ${R?.minBuy ?? 0.1} NEAR`} s="each window" />
        <Step n="02" icon={<Lock size={20} />} t="Hold" s="never sell" />
        <Step n="03" icon={<Coins size={20} />} t={`Top ${R?.topN ?? 10}`} s="get paid" />
      </ol>

      <section className="duo">
        <Card title="Next round" action={<More to="/board">Board</More>}>
          {snap && snap.board.next.length ? (
            <ol className="rank-list">
              {snap.board.next.slice(0, 5).map((r, k) => (
                <li key={r.id}>
                  <span className={`medal m${k + 1}`}>{k + 1}</span>
                  <Link to={`/wallet/${r.id}`} className="who"><Avatar id={r.id} size={24} /><span className="mono">{acct(r.id, 18)}</span></Link>
                  <Streak n={r.liveStreak} />
                  <b className="r">{near(r.est)}</b>
                </li>
              ))}
            </ol>
          ) : (
            <Empty title="Nobody yet" hint="First buy this window takes #1" />
          )}
        </Card>
        <Card title="Live trades" action={<More to="/live">Live</More>}>
          {snap && snap.trades.length ? (
            <ul className="feed">
              {snap.trades.slice(-6).reverse().map((t) => (
                <li key={t.tx + t.w} className={t.side}>
                  <span className={`side ${t.side}`}>{t.side === "buy" ? "Buy" : "Sell"}</span>
                  <Link to={`/wallet/${t.w}`} className="mono">{acct(t.w, 18)}</Link>
                  <b>{near(t.q)}</b>
                  <small className="muted">{ago(t.t, now)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Quiet on chain" hint="Trades appear here live" />
          )}
        </Card>
      </section>
    </>
  );
}

/** A marquee of the latest trades: who is buying, right now. */
function Tape({ snap, now }: { snap: Snapshot; now: number }) {
  const items = snap.trades.slice(-18).reverse();
  const row = items.map((t) => (
    <Link to={`/wallet/${t.w}`} key={t.tx + t.w} className={`tape-item ${t.side}`}>
      <Avatar id={t.w} size={18} />
      <span className="mono">{acct(t.w, 16)}</span>
      <b>{t.side === "buy" ? "+" : "−"}{near(t.q)}</b>
      <small>{ago(t.t, now)}</small>
    </Link>
  ));
  return (
    <div className="tape" aria-label="Latest trades">
      <div className="tape-lane">{row}<span className="tape-dup" aria-hidden>{row}</span></div>
    </div>
  );
}

function Kpi({ icon, label, v, fmt, sub, hot }: { icon: React.ReactNode; label: string; v: number; fmt: (n: number) => string; sub?: string; hot?: boolean }) {
  return (
    <div className={`kpi${hot ? " hot" : ""}`}>
      <span className="kpi-ic">{icon}</span>
      <small>{label}</small>
      <Num v={v} fmt={fmt} className="kpi-v" />
      {sub && <span className="kpi-s">{sub}</span>}
    </div>
  );
}

const Step = ({ n, icon, t, s }: { n: string; icon: React.ReactNode; t: string; s: string }) => (
  <li className="step">
    <span className="step-ic">{icon}</span>
    <div>
      <b>{t}</b>
      <span>{s}</span>
    </div>
    <span className="step-n">{n}</span>
  </li>
);
