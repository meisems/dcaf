import { LINKS } from "../config";
import type { Snapshot } from "../lib/api";
import { acct, near } from "../lib/format";
import { Ago, AppLink, Avatar, Empty } from "./ui";

/** The latest payouts that are on chain, newest round first. */
export const recentPayouts = (snap: Snapshot, limit: number) =>
  snap.rounds.flatMap((r) => r.payouts.filter((p) => p.tx).map((p) => ({ ...p, tx: p.tx!, no: r.no, at: r.at }))).slice(0, limit);

/** Recent payouts, each with its round, receiver, amount and a link to the NEAR transaction. */
export function PayoutFeed({ snap, limit = 6, ago = false }: { snap: Snapshot; limit?: number; ago?: boolean }) {
  const rows = recentPayouts(snap, limit);
  if (!rows.length)
    return snap.info.dryRun
      ? <Empty title="No transfers yet" hint="Dry run: payouts are recorded, not sent" />
      : <Empty title="No payouts yet" hint="They land here, with their transaction, as rounds close" />;
  return (
    <ul className={`feed payouts${ago ? " with-ago" : ""}`}>
      {rows.map((p) => (
        <li key={`${p.no}-${p.w}`}>
          <AppLink to={`/rounds/${p.no}`} className="muted mono">#{p.no}</AppLink>
          <AppLink to={`/wallet/${p.w}`} className="who"><Avatar id={p.w} size={20} /><span className="mono">{acct(p.w, 18)}</span></AppLink>
          <b>+{near(p.amount)}</b>
          {ago && <small className="muted"><Ago t={p.at} /></small>}
          <a className="link mono" href={LINKS.tx(p.tx)} target="_blank" rel="noreferrer" title="View the transaction on NEARBlocks">{p.tx.slice(0, 6)}… ↗</a>
        </li>
      ))}
    </ul>
  );
}
