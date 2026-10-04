
import { LINKS, SYMBOL } from "../config";
import { ArrowRight, BuyCoin, Bell, Coins, Flame, Lock, Users, Vault } from "../components/Icons";
import { Orbit } from "../components/Orbit";
import { memo } from "react";
import { Ago, AppLink, Avatar, Card, Empty, Left, More, Num, StatusPill, Streak, useUi } from "../components/ui";
import { useLive, type Snapshot } from "../lib/api";
import { acct, near, usd } from "../lib/format";
import { useMe } from "../lib/me";
import { disableReminders, enableReminders, useReminders } from "../lib/remind";
import { useFlip } from "../lib/flip";

export default function Home() {
  const { snap } = useLive();
  const i = snap?.info;
  const R = i?.rules;
  const ranks = useFlip<HTMLOListElement>(snap?.board.next);
  const feed = useFlip<HTMLUListElement>(snap?.trades.at(-1)?.tx);

  return (
    <>
      <section className="hero">
        <div className="hero-glow" aria-hidden />
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
            <AppLink className="btn btn-soft btn-lg" to="/me">My streak</AppLink>
          </div>
          <span className="no-connect"><i />No wallet connect · tracked on-chain</span>
        </div>
        <div className="hero-orbit">{snap ? <Orbit snap={snap} /> : <div className="orbit-card skeleton" />}</div>
      </section>

      {snap && <MeStrip snap={snap} />}
      {snap && snap.trades.length > 0 && <Tape trades={snap.trades} />}

      <section className="kpis" data-reveal>
        <Kpi icon={<Vault size={18} />} label="Vault" v={i?.pool ?? 0} fmt={(n) => near(n)} sub={i?.usdPerNear ? usd((i.pool ?? 0) * i.usdPerNear) : undefined} hot />
        <Kpi icon={<Users size={18} />} label="DCAing now" v={i?.dcaingNow ?? 0} fmt={(n) => Math.round(n).toString()} sub={i ? `${i.wallets} traders` : undefined} />
        <Kpi icon={<Flame size={18} />} label="Top streak" v={i?.topStreak ?? 0} fmt={(n) => Math.round(n).toString()} sub="windows" />
        <Kpi icon={<Coins size={18} />} label="Paid out" v={i?.totalPaid ?? 0} fmt={(n) => near(n)} sub={i ? `${i.roundsRun} rounds` : undefined} />
      </section>

      <ol className="flow" data-reveal>
        <Step n="01" icon={<BuyCoin size={20} />} t={`≥ ${R?.minBuy ?? 0.1} NEAR`} s="each window" />
        <Step n="02" icon={<Lock size={20} />} t="Hold" s="never sell" />
        <Step n="03" icon={<Coins size={20} />} t={`Top ${R?.topN ?? 10}`} s="get paid" />
      </ol>

      <section className="duo" data-reveal>
        <Card title="Next round" action={<More to="/board">Board</More>}>
          {snap && snap.board.next.length ? (
            <ol className="rank-list" ref={ranks}>
              {snap.board.next.slice(0, 5).map((r, k) => (
                <li key={r.id} data-flip={r.id}>
                  <span className={`medal m${k + 1}`}>{k + 1}</span>
                  <AppLink to={`/wallet/${r.id}`} className="who"><Avatar id={r.id} size={24} /><span className="mono">{acct(r.id, 18)}</span></AppLink>
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
            <ul className="feed" ref={feed}>
              {snap.trades.slice(-6).reverse().map((t) => (
                <li key={t.tx + t.w} data-flip={t.tx + t.w} className={t.side}>
                  <span className={`side ${t.side}`}>{t.side === "buy" ? "Buy" : "Sell"}</span>
                  <AppLink to={`/wallet/${t.w}`} className="mono">{acct(t.w, 18)}</AppLink>
                  <b>{near(t.q)}</b>
                  <small className="muted"><Ago t={t.t} /></small>
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

/** Your wallet in one line: streak, where you stand, what to do next. */
function MeStrip({ snap }: { snap: Snapshot }) {
  const me = useMe();
  const { mine } = useUi();
  const remind = useReminders();
  if (!me)
    return (
      <AppLink to="/me" className="me-strip ghost" data-reveal>
        <BuyCoin size={18} /> <span>Track your wallet</span> <small className="muted">no connect</small> <ArrowRight size={16} />
      </AppLink>
    );
  if (!mine) return <div className="me-strip skeleton" />;
  const i = snap.info;
  const topN = i.rules.topN;
  const msg =
    mine.status === "dcaing"
      ? mine.rank !== null && mine.rank <= topN ? <>#{mine.rank} · <b>≈ {near(mine.est)}</b></> : <>#{mine.rank} · outside top {topN}</>
      : mine.status === "waiting" ? <>Buy within <b className="mono"><Left at={i.nextRoundAt} /></b></>
      : mine.status === "notyet" ? <>{near(i.rules.minTotal - mine.total)} more to count</>
      : mine.status === "out" ? <>Out for good</>
      : <>Buy within <b className="mono"><Left at={i.nextRoundAt} /></b></>;
  const canBuy = mine.status !== "out" && mine.status !== "dcaing";
  return (
    <div className={`me-strip st-${mine.status}`}>
      <AppLink to="/me" className="ms-who">
        <Avatar id={me} size={34} />
        <span><b className="mono">{acct(me, 18)}</b><StatusPill s={mine.known ? mine.status : "idle"} /></span>
      </AppLink>
      <span className="ms-streak"><Streak n={mine.liveStreak} size={18} /></span>
      <span className="ms-msg">{msg}</span>
      <span className="ms-actions">
        <button className={`icon-btn${remind ? " on" : ""}`} onClick={() => (remind ? disableReminders() : void enableReminders())} aria-pressed={remind} aria-label={remind ? "Reminders on" : "Remind me before my streak breaks"} title={remind ? "Reminders on" : "Remind me"}>
          <Bell size={17} />
        </button>
        {canBuy && <a className="btn btn-grad btn-sm" href={LINKS.buy} target="_blank" rel="noreferrer">Buy ↗</a>}
      </span>
    </div>
  );
}

/** A marquee of the latest trades: who is buying, right now. */
const Tape = memo(function Tape({ trades }: { trades: Snapshot["trades"] }) {
  const items = trades.slice(-18).reverse();
  const row = items.map((t) => (
    <AppLink to={`/wallet/${t.w}`} key={t.tx + t.w} className={`tape-item ${t.side}`}>
      <Avatar id={t.w} size={18} />
      <span className="mono">{acct(t.w, 16)}</span>
      <b>{t.side === "buy" ? "+" : "−"}{near(t.q)}</b>
      <small><Ago t={t.t} /></small>
    </AppLink>
  ));
  return (
    <div className="tape" aria-label="Latest trades">
      <div className="tape-lane">{row}<span className="tape-dup" aria-hidden>{row}</span></div>
    </div>
  );
});

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
