import { useEffect, useRef, useState } from "react";
import { LINKS } from "../config";
import { getWallet, peekWallet, type Snapshot, type WalletReport, paidCount } from "../lib/api";
import { acct, dateTime, near, pct } from "../lib/format";
import { ArrowUpRight, Check, Chevron, Cross, Dots } from "./Icons";
import { Ago, Avatar, Left, Num, StatusPill, Streak } from "./ui";

/** Fetch a wallet report and keep it fresh (every ~3s while visible). */
export function useReport(id: string | null) {
  const [rep, setRep] = useState<WalletReport | null>(() => (id ? peekWallet(id) : null));
  const [err, setErr] = useState<string | null>(null);
  const want = useRef(id);
  useEffect(() => {
    want.current = id;
    setRep(id ? peekWallet(id) : null); // cached report paints instantly, fresh one follows
    setErr(null);
    if (!id) return;
    let t: ReturnType<typeof setTimeout>;
    const load = () =>
      getWallet(id)
        .then((r) => want.current === id && (setRep(r), setErr((e) => (e ? null : e))))
        .catch((e: Error) => want.current === id && setErr(e.message))
        .finally(() => want.current === id && (t = setTimeout(load, document.hidden ? 15000 : 3000)));
    void load();
    return () => clearTimeout(t);
  }, [id]);
  return { rep, err };
}

export function WalletCard({ rep, snap, mine }: { rep: WalletReport; snap: Snapshot; mine: boolean }) {
  const { info } = snap;
  const R = info.rules;
  const [open, setOpen] = useState(false);
  const inTop = rep.rank !== null && rep.rank <= paidCount(R);

  const head = (() => {
    if (!rep.known) return { h: "No buys yet", s: `${R.minBuy} NEAR starts a streak` };
    switch (rep.status) {
      case "dcaing":
        return inTop
          ? { h: `#${rep.rank} in round ${info.windowNo}`, s: `≈ ${near(rep.est)} · ${pct(rep.share)} of the vault` }
          : { h: `#${rep.rank} · outside top ${R.topN}`, s: "Buy more or keep the streak to climb" };
      case "waiting":
        return { h: "Streak at risk", s: <>Buy within <Left at={info.nextRoundAt} /></> };
      case "notyet":
        return { h: "Warming up", s: `${near(R.minTotal - rep.total)} more to count` };
      case "out":
        return { h: "Out for good", s: rep.outReason === "sold" ? "Sold once" : "Moved tokens" };
      default:
        return { h: "No streak", s: <>Buy within <Left at={info.nextRoundAt} /></> };
    }
  })();

  const paid = new Set(rep.history.map((h) => h.round));
  const cells = snap.rounds.slice(0, 23).reverse().map((r) => ({ no: r.no, on: paid.has(r.no) }));

  return (
    <div className={`wcard st-${rep.status}${inTop ? " top" : ""}`}>
      <div className="wcard-top">
        <Avatar id={rep.id} size={44} />
        <div className="wcard-id">
          <a href={LINKS.account(rep.id)} target="_blank" rel="noreferrer" className="mono">{acct(rep.id, 30)} <ArrowUpRight size={13} /></a>
          <small className="muted">{rep.firstAt ? <>since <Ago t={rep.firstAt} /></> : "new"}{rep.lastBuyAt ? <> · last buy <Ago t={rep.lastBuyAt} /></> : null}</small>
        </div>
        <StatusPill s={rep.known ? rep.status : "idle"} />
      </div>

      <div className="wcard-main">
        <div className="big-streak"><Streak n={rep.liveStreak} size={30} /></div>
        <div className="wcard-head">
          <h3>{head.h}</h3>
          <p>{head.s}</p>
        </div>
        {mine && rep.status !== "out" && (
          <a className="btn btn-grad" href={LINKS.buy} target="_blank" rel="noreferrer">Buy now ↗</a>
        )}
      </div>

      <ul className="checks">
        {rep.checks.map((c) => (
          <li key={c.key} className={c.ok ? "ok" : c.pending ? "pending" : "fail"}>
            <span className="ck">{c.ok ? <Check size={13} /> : c.pending ? <Dots size={13} /> : <Cross size={13} />}</span>
            <b>{c.label}</b>
            <span>{c.detail}</span>
          </li>
        ))}
      </ul>

      <div className="mini-stats">
        <div><small>Earned</small><Num v={rep.earned} fmt={(n) => near(n)} /></div>
        <div><small>Best</small><b><Streak n={rep.bestStreak} /></b></div>
        <div><small>Bought</small><b>{near(rep.total)}</b></div>
        <div><small>This window</small><b>{near(rep.windowBuy)}</b></div>
      </div>

      {cells.length > 0 && (
        <div className="strip" role="img" aria-label={`Paid in ${cells.filter((c) => c.on).length} of the last ${cells.length} rounds`}>
          {cells.map((c) => <i key={c.no} className={c.on ? "on" : ""} title={`#${c.no}${c.on ? " · paid" : ""}`} />)}
          <i className={`now ${rep.windowBuy >= R.minBuy ? "on" : ""}`} title={`#${info.windowNo} · open`} />
        </div>
      )}

      {rep.history.length > 0 && (
        <div className="wcard-hist">
          <button className="disclose" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {rep.history.length} payout{rep.history.length > 1 ? "s" : ""} <Chevron size={16} />
          </button>
          {open && (
            <div className="table-scroll">
              <table className="tbl">
                <tbody>
                  {rep.history.map((h) => (
                    <tr key={h.round}>
                      <td>#{h.round}</td>
                      <td className="muted">{dateTime(h.at)}</td>
                      <td><Streak n={h.streak} size={12} /></td>
                      <td className="r"><b>{near(h.amount)}</b></td>
                      <td className="r">{h.tx ? <a className="link mono" href={LINKS.tx(h.tx)} target="_blank" rel="noreferrer">{h.tx.slice(0, 6)}… ↗</a> : <span className="muted">dry</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
