import { Fragment, useState } from "react";

import { AppLink, Avatar, Empty, PageHead, StatusPill, Streak } from "../components/ui";
import { useLive, type BoardRow, paidCount } from "../lib/api";
import { acct, near, pct, payout } from "../lib/format";
import { Search } from "../components/Icons";
import { useFlip } from "../lib/flip";
import { useMe } from "../lib/me";
import { usePageName } from "../lib/hooks";

const TABS = [
  { k: "next", label: "Next round" },
  { k: "streaks", label: "Streaks" },
  { k: "allTime", label: "All-time" },
] as const;
type K = (typeof TABS)[number]["k"];

export default function Board() {
  usePageName("Leaderboard");
  const { snap } = useLive();
  const account = useMe();
  const [tab, setTab] = useState<K>("next");
  const [all, setAll] = useState(false);
  const [filter, setFilter] = useState("");
  const body = useFlip<HTMLTableSectionElement>(`${tab}:${snap?.board[tab].map((r) => r.id).join()}`);
  if (!snap) return <div className="card skeleton" style={{ height: 480 }} />;
  const topN = paidCount(snap.info.rules);
  const f = filter.trim().toLowerCase();
  const ranked = snap.board[tab].map((r, k) => ({ r, k }));
  const rows = snap.board[tab];
  const filtered = f ? ranked.filter(({ r }) => r.id.includes(f)) : ranked;
  const shown = all || f ? filtered : filtered.slice(0, 30);
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
              <b>{payout(r.est, r.share, snap.info.pool)}</b>
              <Streak n={r.liveStreak} />
            </AppLink>
          ))}
        </div>
      )}

      <section className="card">
        <div className="board-tools">
          <label className="mini-search">
            <Search size={15} />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" spellCheck={false} autoCapitalize="off" aria-label="Filter wallets" />
          </label>
          {me >= 0 && (
            <button className="me-chip" onClick={() => jump(rows[me].id)}>
              You're <b>#{me + 1}</b>{tab === "next" && me >= topN ? ` · top ${topN} get paid` : ""} <span aria-hidden>↓</span>
            </button>
          )}
        </div>
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
                  <th className="r">{tab === "allTime" ? "Earned" : snap.info.pool > 0 ? "Est." : "Share"}</th>
                </tr>
              </thead>
              <tbody ref={body}>
                {f && !shown.length && (
                  <tr><td colSpan={6} className="muted center">No wallet matches “{filter}”</td></tr>
                )}
                {shown.map(({ r, k }) => (
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
                      <td className="r"><b>{tab === "allTime" ? near(r.earned) : payout(r.est, r.share, snap.info.pool)}</b></td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!f && rows.length > 30 && <button className="btn btn-soft more board-more" onClick={() => setAll((a) => !a)}>{all ? "Less" : `All ${rows.length}`}</button>}
      </section>
    </>
  );
}

/** Scroll to a row and make it glow, showing all rows first if it's further down. */
function jump(id: string) {
  const find = () => document.querySelector<HTMLElement>(`[data-flip="${CSS.escape(id)}"]`);
  const go = (el: HTMLElement) => {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.animate([{ backgroundColor: "rgba(255, 200, 61, 0.28)" }, { backgroundColor: "transparent" }], { duration: 1800, easing: "ease-out" });
  };
  const el = find();
  if (el) return go(el);
  (document.querySelector(".board-more") as HTMLButtonElement | null)?.click();
  requestAnimationFrame(() => requestAnimationFrame(() => { const e = find(); if (e) go(e); }));
}

const metric = (tab: K, r: BoardRow) => (tab === "allTime" ? r.earned : tab === "streaks" ? r.liveStreak : r.share);
