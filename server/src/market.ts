import { CFG } from "./config.ts";
import type { Db } from "./db.ts";
import type { Engine } from "./engine.ts";
import { available, view, yoctoToNear } from "./near.ts";

/** Token decimals, cached in meta so a restarted Worker doesn't need the RPC to boot. */
export async function loadToken(engine: Engine, db: Db) {
  const cached = db.meta.get("decimals");
  if (cached !== undefined) return void (engine.decimals = Number(cached));
  const meta = await view<{ decimals: number; symbol: string }>(CFG.token, "ft_metadata");
  engine.decimals = meta.decimals;
  db.meta.set("decimals", meta.decimals);
}

const last: Record<string, number> = {};
const due = (k: string, ms: number) => {
  if (Date.now() - (last[k] ?? 0) < ms) return false;
  last[k] = Date.now();
  return true;
};

/** Slow-moving facts (vault balance, spot price, supply, NEAR/USD), each refreshed when stale. */
export async function refreshMarket(engine: Engine) {
  const jobs: Promise<void>[] = [];
  if (due("vault", 20_000))
    jobs.push(available(CFG.vaultAccount).then((y) => void (engine.vaultBalance = yoctoToNear(y))));
  if (due("supply", 10 * 60_000))
    jobs.push(view<string>(CFG.token, "ft_total_supply").then((s) => void (engine.supply = Number(BigInt(s)) / 10 ** engine.decimals)));
  if (CFG.refPoolId !== null && due("pool", 30_000))
    jobs.push(
      view<{ token_account_ids: string[]; amounts: string[] }>(CFG.ref, "get_pool", { pool_id: CFG.refPoolId }).then((pool) => {
        const iw = pool.token_account_ids.indexOf(CFG.wrap);
        const it = pool.token_account_ids.indexOf(CFG.token);
        if (iw < 0 || it < 0) throw new Error(`pool ${CFG.refPoolId} is not ${CFG.token}/${CFG.wrap}`);
        const t = Number(BigInt(pool.amounts[it])) / 10 ** engine.decimals;
        if (t > 0) engine.price = Number(BigInt(pool.amounts[iw])) / 1e24 / t;
      }),
    );
  if (due("usd", 5 * 60_000))
    jobs.push(
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=near&vs_currencies=usd")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => void ((j as { near?: { usd?: number } } | null)?.near?.usd && (engine.usdPerNear = (j as { near: { usd: number } }).near.usd))),
    );
  for (const r of await Promise.allSettled(jobs)) if (r.status === "rejected") console.warn("market:", (r.reason as Error)?.message);
}
