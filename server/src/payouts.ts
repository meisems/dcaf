import { Account } from "near-api-js";
import { CFG } from "./config.ts";
import type { Db } from "./db.ts";

type Row = { no: number; w: string; yocto: string; attempts: number };

let vault: Account | null = null;

/**
 * Sends pending payouts from the vault, one transfer per wallet, oldest round first,
 * for up to `budgetMs`. State lives in the payouts table, so any interruption simply resumes.
 * Returns how many are still waiting.
 */
export async function sendPayouts(db: Db, budgetMs = 8000): Promise<number> {
  const count = () => Number(db.prepare("SELECT COUNT(*) AS n FROM payouts WHERE status = 'pending'").get()?.n ?? 0);
  if (CFG.dryRun) return 0;
  vault ??= new Account(CFG.vaultAccount, CFG.rpc, CFG.vaultKey as `ed25519:${string}`);
  const next = db.prepare("SELECT no, w, yocto, attempts FROM payouts WHERE status = 'pending' ORDER BY no, amount DESC LIMIT 10");
  const ok = db.prepare("UPDATE payouts SET status = 'sent', tx = ?, err = NULL WHERE no = ? AND w = ?");
  const bad = db.prepare("UPDATE payouts SET attempts = attempts + 1, err = ?, status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END WHERE no = ? AND w = ?");
  const t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    const rows = next.all() as unknown as Row[];
    if (!rows.length) break;
    for (const r of rows) {
      if (Date.now() - t0 >= budgetMs) break;
      try {
        const res = await vault.transfer({ receiverId: r.w, amount: BigInt(r.yocto) });
        ok.run(res.transaction.hash, r.no, r.w);
        console.log(`→ paid ${r.w} for round #${r.no}: ${res.transaction.hash}`);
      } catch (err) {
        const msg = String((err as Error)?.message ?? err).slice(0, 300);
        bad.run(msg, r.no, r.w);
        console.warn(`✗ payout ${r.w} #${r.no} (try ${r.attempts + 1}): ${msg}`);
        return count(); // back off until the next tick
      }
    }
  }
  return count();
}
