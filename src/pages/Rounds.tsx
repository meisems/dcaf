import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { LINKS } from "../config";
import { Ago, AppLink, Avatar, Card, Empty, PageHead, Streak } from "../components/ui";
import { getRound, peekRound, useLive, type Round, type Snapshot } from "../lib/api";
import { acct, clock, dateTime, near, usd } from "../lib/format";
import { usePageName } from "../lib/hooks";

export default function Rounds() {
  usePageName("Rounds");
  const { snap } = useLive();
  if (!snap) return <div className="card skeleton" style={{ height: 420 }} />;
  const rounds = snap.rounds;
  const recent = rounds.slice(0, 30).reverse();
  const peak = Math.max(1e-9, ...recent.map((r) => r.pool));
  const u = snap.info.usdPerNear;

  return (
    <>
      <PageHead kicker="Rounds" title="Every payout" />
      <Proof snap={snap} />
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
                    {r.qualifiers === 0 ? <span className="pill pill-info">Stacked</span> : <><span className="muted">{r.payouts.length} paid</span><ProofBadge r={r} /></>}
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
  usePageName(`Round #${no}`);
  const [r, setR] = useState<Round | null | undefined>(() => peekRound(Number(no)) ?? undefined);
  useEffect(() => {
    setR(peekRound(Number(no)) ?? undefined);
    getRound(Number(no)).then(setR).catch(() => setR(null));
  }, [no]);

  if (r === undefined) return <div className="card skeleton" style={{ height: 380 }} />;
  if (r === null) return <Card><Empty title={`No round #${no}`}><AppLink to="/rounds" className="btn btn-soft">All rounds</AppLink></Empty></Card>;
  return (
    <>
      <PageHead kicker={`${dateTime(r.start)} → ${clock(r.at)}`} title={`Round #${r.no}`}>
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
      {r.payouts.length > 0 && <RoundProof r={r} />}
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

/** Where a round's payouts stand on chain. */
function proofOf(r: Round) {
  const total = r.payouts.length;
  const sent = r.payouts.filter((p) => p.status === "sent" && p.tx).length;
  const dry = r.payouts.some((p) => p.status === "dry");
  const failed = r.payouts.filter((p) => p.status === "failed").length;
  return { total, sent, dry, failed };
}

function ProofBadge({ r }: { r: Round }) {
  const p = proofOf(r);
  if (!p.total) return null;
  if (p.dry) return <span className="pill pill-info" title="Dry run: recorded, not sent">dry run</span>;
  if (p.sent === p.total) return <span className="pill pill-good" title="Every transfer is confirmed on NEAR">✓ {p.sent}/{p.total} on-chain</span>;
  if (p.failed) return <span className="pill pill-bad">{p.failed} failed</span>;
  return <span className="pill pill-info">{p.sent}/{p.total} sending</span>;
}

function RoundProof({ r }: { r: Round }) {
  const p = proofOf(r);
  const { snap } = useLive();
  const vault = snap?.info.vaultAccount;
  return (
    <p className="proof-line">
      <ProofBadge r={r} />
      <span>
        {p.dry
          ? "Dry run: these payouts were recorded, not sent."
          : p.sent === p.total
            ? `Every transfer of this round is on NEAR. Open any Tx to check the amount and the receiver.`
            : `${p.sent} of ${p.total} transfers confirmed so far. The rest are being sent.`}
      </span>
      {vault && <a className="link" href={LINKS.account(vault)} target="_blank" rel="noreferrer">Vault on NEARBlocks ↗</a>}
    </p>
  );
}

/** The receipts: totals, the vault anyone can audit, and the latest transfers with their transactions. */
function Proof({ snap }: { snap: Snapshot }) {
  const i = snap.info;
  const latest = snap.rounds.flatMap((r) => r.payouts.filter((p) => p.tx).map((p) => ({ ...p, no: r.no, at: r.at }))).slice(0, 6);
  return (
    <section className="card proof">
      <div className="proof-head">
        <div>
          <h2>Proof of payouts</h2>
          <p className="muted">
            {i.dryRun
              ? "Dry run: payouts are recorded but not sent yet, so there are no transactions to show."
              : "Every payout is a plain NEAR transfer from the vault. Check any of them on NEARBlocks."}
          </p>
        </div>
        <a className="btn btn-soft" href={LINKS.account(i.vaultAccount)} target="_blank" rel="noreferrer">Vault on NEARBlocks ↗</a>
      </div>
      <div className="kpis three">
        <div className="kpi"><small>Paid out</small><span className="kpi-v">{near(i.totalPaid)}</span><span className="kpi-s">{i.roundsRun} rounds</span></div>
        <div className="kpi"><small>On-chain transfers</small><span className="kpi-v">{i.payoutsSent}</span><span className="kpi-s">each with a transaction</span></div>
        <div className="kpi"><small>Sending</small><span className="kpi-v">{i.payoutsPending}</span><span className="kpi-s">{i.payoutsPending ? "confirming now" : "nothing waiting"}</span></div>
      </div>
      {latest.length > 0 && (
        <ul className="feed">
          {latest.map((p) => (
            <li key={`${p.no}-${p.w}`}>
              <AppLink to={`/rounds/${p.no}`} className="muted mono">#{p.no}</AppLink>
              <AppLink to={`/wallet/${p.w}`} className="who"><Avatar id={p.w} size={20} /><span className="mono">{acct(p.w, 20)}</span></AppLink>
              <b>{near(p.amount)}</b>
              <a className="link mono" href={LINKS.tx(p.tx!)} target="_blank" rel="noreferrer">{p.tx!.slice(0, 6)}… ↗</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
