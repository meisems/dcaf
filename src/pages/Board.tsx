import { Fragment, useState } from "react";

import { AppLink, Avatar, Empty, PageHead, StatusPill, Streak } from "../components/ui";
import { useLive, type BoardRow } from "../lib/api";
import { acct, near, pct } from "../lib/format";
import { useFlip } from "../lib/flip";
import { useMe } from "../lib/me";

const TABS = [
  { k: "next", label: "Next round" },
  { k: "streaks", label: "Streaks" },
  { k: "allTime", label: "All-time" },
] as const;
type K = (typeof TABS)[number]["k"];

export default function Board() {
  const { snap } = useLive();
  const account = useMe();
  const [tab, setTab] = useState<K>("next");
  const [all, setAll] = useState(false);
  const body = useFlip<HTMLTableSectionElement>(`${tab}:${snap?.board[tab].map((r) => r.id).join()}`);
  if (!snap) return <div className="card skeleton" style={{ height: 480 }} />;
  const topN = snap.info.rules.topN;
  const rows = snap.board[tab];
  const shown = all ? rows : rows.slice(0, 30);
  const me = account ? rows.findIndex((r) => r.id === account) : -1;
  const max = Math.max(1e-9, ...rows.map((r) => metric(tab, r)));

  return (
    <>
      <PageHead kicker="Leaderboard" title="Top DCAers">
        <div className="seg" role="tablist">
          {TABS.map((t) => (
            <button key={t.k} role="tab" aria-selected={tab === t.k} className={tab === t.k ? "on" : ""} onClick={() => (setTab(t.k), setAll(false))}>{t.label}</button>
          ))}
        </div>
      </PageHead>

      {tab === "next" && rows.length > 0 && (
        <div className="podium" data-reveal>
          {rows.slice(0, 3).map((r, k) => (
            <AppLink to={`/wallet/${r.id}`} key={r.id} className={`pod p${k + 1}`}>
              <span className={`medal m${k + 1}`}>{k + 1}</span>
              <Avatar id={r.id} size={40} />
              <span className="mono">{acct(r.id, 16)}</span>
              <b>{near(r.est)}</b>
              <Streak n={r.liveStreak} />
            </AppLink>
          ))}
        </div>
      )}

      <section className="card">
        {me >= 0 && <p className="me-chip">You're <b>#{me + 1}</b>{tab === "next" && me >= topN ? ` · top ${topN} get paid` : ""}</p>}
        {rows.length === 0 ? (
          <Empty title={tab === "next" ? "No one in this window" : "Nothing yet"} hint={tab === "next" ? "Be the first buy" : undefined} />
        ) : (
          <div className="table-scroll">
            <table className="tbl board">
              <thead>
                <tr>
                  <th className="rank">#</th><th>Wallet</th><th>Streak</th>
                  <th className="hide-sm">{tab === "allTime" ? "Bought" : "Window"}</th>
                  <th className="bar-col hide-sm">{tab === "next" ? "Share" : tab === "streaks" ? "Status" : "Share"}</th>
                  <th className="r">{tab === "allTime" ? "Earned" : "Est."}</th>
                </tr>
              </thead>
              <tbody ref={body}>
                {shown.map((r, k) => (
                  <Fragment key={r.id}>
                    {tab === "next" && k === topN && (
                      <tr className="cutoff"><td colSpan={6}><span>Top {topN} get paid · below here earns nothing this round</span></td></tr>
                    )}
                    <tr data-flip={r.id} className={`${r.id === account ? "me" : ""} ${tab === "next" && k >= topN ? "dim" : ""}`}>
                      <td className="rank">{k < 3 ? <span className={`medal m${k + 1}`}>{k + 1}</span> : k + 1}</td>
                      <td><AppLink className="who" to={`/wallet/${r.id}`}><Avatar id={r.id} size={24} /><span className="mono">{acct(r.id, 22)}</span></AppLink></td>
                      <td><Streak n={r.liveStreak} /></td>
                      <td className="hide-sm muted">{near(tab === "allTime" ? r.total : r.windowBuy)}</td>
                      <td className="bar-col hide-sm">
                        {tab === "streaks" ? <StatusPill s={r.status} /> : (
                          <div className="sbar"><i style={{ width: `${Math.max(3, (metric(tab, r) / max) * 100)}%` }} />{tab === "next" && <span>{pct(r.share)}</span>}</div>
                        )}
                      </td>
                      <td className="r"><b>{near(tab === "allTime" ? r.earned : r.est)}</b></td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 30 && <button className="btn btn-soft more" onClick={() => setAll((a) => !a)}>{all ? "Less" : `All ${rows.length}`}</button>}
      </section>
    </>
  );
}

const metric = (tab: K, r: BoardRow) => (tab === "allTime" ? r.earned : tab === "streaks" ? r.liveStreak : r.share);
