import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { LINKS } from "../config";
import { Ago, AppLink, Avatar, Card, Empty, PageHead, Streak } from "../components/ui";
import { getRound, peekRound, useLive, type Round } from "../lib/api";
import { acct, clock, dateTime, near, usd } from "../lib/format";

export default function Rounds() {
  const { snap } = useLive();
  if (!snap) return <div className="card skeleton" style={{ height: 420 }} />;
  const rounds = snap.rounds;
  const recent = rounds.slice(0, 30).reverse();
  const peak = Math.max(1e-9, ...recent.map((r) => r.pool));
  const u = snap.info.usdPerNear;

  return (
    <>
      <PageHead kicker="Rounds" title="Every payout" />
      {rounds.length === 0 ? (
        <Card><Empty title="No rounds yet" hint="The first one closes soon" /></Card>
      ) : (
        <>
          <section className="card spark-card">
            <div className="spark" role="img" aria-label="Vault per round">
              {recent.map((r) => (
                <AppLink to={`/rounds/${r.no}`} key={r.no} className={`spark-col${r.golden ? " gold" : ""}${r.qualifiers === 0 ? " none" : ""}`} title={`#${r.no} · ${near(r.pool)}`}>
                  <i style={{ height: `${Math.max(5, (r.pool / peak) * 100)}%` }} />
                </AppLink>
              ))}
            </div>
          </section>
          <ul className="rounds">
            {rounds.map((r) => (
              <li key={r.no}>
                <AppLink to={`/rounds/${r.no}`} className="round-row">
                  <span className="round-no">#{r.no}</span>
                  <span className="round-when"><b>{clock(r.at)}</b><small className="muted"><Ago t={r.at} /></small></span>
                  <span className="round-tags">
                    {r.golden > 0 && <span className="golden">Golden ×{r.golden}</span>}
                    {r.qualifiers === 0 ? <span className="pill pill-info">Stacked</span> : <span className="muted">{r.payouts.length} paid</span>}
                  </span>
                  <span className="round-amt"><b>{near(r.qualifiers ? r.paid : r.pool)}</b><small className="muted">{r.qualifiers ? (u ? usd(r.paid * u) : "") : "rolled"}</small></span>
                </AppLink>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export function RoundPage() {
  const { no } = useParams();
  const [r, setR] = useState<Round | null | undefined>(() => peekRound(Number(no)) ?? undefined);
  useEffect(() => {
    setR(peekRound(Number(no)) ?? undefined);
    getRound(Number(no)).then(setR).catch(() => setR(null));
  }, [no]);

  if (r === undefined) return <div className="card skeleton" style={{ height: 380 }} />;
  if (r === null) return <Card><Empty title={`No round #${no}`}><AppLink to="/rounds" className="btn btn-soft">All rounds</AppLink></Empty></Card>;
  return (
    <>
      <PageHead kicker={dateTime(r.at)} title={`Round #${r.no}`}>
        <div className="row-gap">
          {Number(no) > 1 && <AppLink className="btn btn-soft" to={`/rounds/${Number(no) - 1}`}>← #{Number(no) - 1}</AppLink>}
          <AppLink className="btn btn-soft" to={`/rounds/${Number(no) + 1}`}>#{Number(no) + 1} →</AppLink>
        </div>
      </PageHead>
      <section className="kpis three">
        <div className="kpi hot"><small>Vault</small><span className="kpi-v">{near(r.pool)}</span></div>
        <div className="kpi"><small>Paid</small><span className="kpi-v">{near(r.paid)}</span><span className="kpi-s">{r.payouts.length} wallets</span></div>
        <div className="kpi"><small>Rolled over</small><span className="kpi-v">{near(r.rolled)}</span>{r.golden > 0 && <span className="golden">Golden ×{r.golden}</span>}</div>
      </section>
      <Card>
        {r.payouts.length ? (
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>#</th><th>Wallet</th><th>Streak</th><th className="r hide-sm">Bought</th><th className="r">Paid</th><th className="r">Tx</th></tr></thead>
              <tbody>
                {r.payouts.map((p, k) => (
                  <tr key={p.w}>
                    <td className="muted">{k + 1}</td>
                    <td><AppLink className="who" to={`/wallet/${p.w}`}><Avatar id={p.w} size={22} /><span className="mono">{acct(p.w, 22)}</span></AppLink></td>
                    <td><Streak n={p.streak} /></td>
                    <td className="r hide-sm muted">{near(p.buy)}</td>
                    <td className="r"><b>{near(p.amount)}</b></td>
                    <td className="r">
                      {p.tx ? <a className="link mono" href={LINKS.tx(p.tx)} target="_blank" rel="noreferrer">{p.tx.slice(0, 6)}… ↗</a> : <span className={`pill pill-${p.status === "failed" ? "bad" : "info"}`}>{p.status}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Nobody qualified" hint="The vault stacked into the next round" />
        )}
      </Card>
    </>
  );
}
