import { useState } from "react";
import { useParams } from "react-router";
import { LINKS } from "../config";
import { Bean, Bell, Check, Copy, Search } from "../components/Icons";
import { Mark } from "../components/Logo";
import { useReport, WalletCard } from "../components/WalletCard";
import { AppLink, Avatar, Card, Empty, PageHead } from "../components/ui";
import { useLive } from "../lib/api";
import { acct, ago, isAccountId, near } from "../lib/format";
import { useNow } from "../lib/hooks";
import { setMe, useMe } from "../lib/me";
import { disableReminders, enableReminders, useReminders } from "../lib/remind";
import { useToast } from "../lib/toast";

/** No wallet to connect: type your account once, it's remembered on this device. */
export default function Me() {
  const me = useMe();
  if (me) return <WalletView id={me} mine />;
  return <Track />;
}

function Track() {
  const { snap } = useLive();
  const [q, setQ] = useState("");
  const [bad, setBad] = useState(false);
  const v = q.trim().toLowerCase();
  const hits = v.length > 1 ? (snap?.board.streaks ?? []).map((r) => r.id).filter((id) => id.includes(v)).slice(0, 4) : [];
  const go = (id: string) => (isAccountId(id) ? setMe(id) : setBad(true));
  return (
    <div className="track">
      <Mark size={92} shadow live />
      <h1>Your streak</h1>
      <p className="muted">No connect. Buys are tracked on-chain, rewards land automatically.</p>
      <form className="track-in" onSubmit={(e) => (e.preventDefault(), go(v))}>
        <Search size={18} />
        <input value={q} onChange={(e) => (setQ(e.target.value), setBad(false))} placeholder="alice.near" spellCheck={false} autoCapitalize="off" autoComplete="off" aria-label="Your NEAR account" aria-invalid={bad} autoFocus />
        <button className="btn btn-grad btn-sm" type="submit" disabled={!v}>Track</button>
      </form>
      {bad && <p className="form-err">Not a NEAR account id</p>}
      {hits.length > 0 && (
        <div className="track-hits">
          {hits.map((h) => (
            <button key={h} className="chip chip-btn" onClick={() => setMe(h)}><Avatar id={h} size={18} /> <span className="mono">{acct(h, 20)}</span></button>
          ))}
        </div>
      )}
    </div>
  );
}

export function WalletPage() {
  const { id = "" } = useParams();
  const me = useMe();
  const v = id.toLowerCase();
  if (!isAccountId(v)) return <Card><Empty title="Not a NEAR account" hint={id} /></Card>;
  return <WalletView id={v} mine={v === me} />;
}

function WalletView({ id, mine }: { id: string; mine: boolean }) {
  const { snap } = useLive();
  const { rep, err } = useReport(id);
  const me = useMe();
  const now = useNow();
  const toast = useToast();
  const remind = useReminders();
  const share = async () => {
    const url = `${location.origin}/wallet/${id}`;
    const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
    if (nav.share) return nav.share({ title: `${acct(id, 24)} on dcaf`, url }).catch(() => {});
    await navigator.clipboard?.writeText(url);
    toast({ tone: "good", title: "Link copied" });
  };
  if (err) return <Card><Empty title="Couldn't load" hint={err} /></Card>;
  if (!rep || !snap) return <div className="wcard skeleton" style={{ height: 420 }} />;
  return (
    <>
      <PageHead kicker={mine ? "My streak" : "Wallet"} title={acct(id, 24)}>
        <div className="row-gap">
          {mine && (
            <button className={`btn btn-soft btn-sm${remind ? " on" : ""}`} onClick={() => (remind ? disableReminders() : void enableReminders())} aria-pressed={remind}>
              <Bell size={15} /> {remind ? "Reminding" : "Remind me"}
            </button>
          )}
          <button className="btn btn-soft btn-sm" onClick={() => void share()}><Copy size={15} /> Share</button>
          {mine ? (
            <button className="btn btn-soft btn-sm" onClick={() => setMe(null)}>Change</button>
          ) : (
            !me && <button className="btn btn-soft btn-sm" onClick={() => setMe(id)}><Check size={15} /> This is me</button>
          )}
        </div>
      </PageHead>
      <WalletCard rep={rep} snap={snap} mine={mine} />
      {rep.trades && rep.trades.length > 0 && (
        <Card title="Trades" action={<a className="more-link" href={LINKS.account(id)} target="_blank" rel="noreferrer">Explorer ↗</a>}>
          <ul className="feed">
            {rep.trades.map((t) => (
              <li key={t.tx + t.t} className={t.side}>
                <span className={`side ${t.side}`}>{t.side === "buy" ? "Buy" : "Sell"}</span>
                <a className="mono" href={LINKS.tx(t.tx)} target="_blank" rel="noreferrer">{t.tx.slice(0, 8)}…</a>
                <b>{near(t.q)}</b>
                <small className="muted">{ago(t.t, now)}</small>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {!rep.known && mine && (
        <p className="center"><a className="btn btn-grad" href={LINKS.buy} target="_blank" rel="noreferrer"><Bean size={16} /> First buy</a></p>
      )}
      {!mine && <p className="center"><AppLink to="/board" className="more-link">Leaderboard →</AppLink></p>}
    </>
  );
}
