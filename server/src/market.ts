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

type Pool = { pool_kind: string; token_account_ids: string[]; amounts: string[] };
const PAGE = 500;

/**
 * The TOKEN/wNEAR pool used for the spot price. REF_POOL_ID wins; otherwise the engine finds the
 * classic pool with the most wNEAR next to the token by itself, one page of pools per tick (so no
 * single run does much work), and remembers it. If the token has no pool yet, it looks again hourly.
 */
export async function poolFor(db: Db): Promise<number | null> {
  if (CFG.refPoolId !== null) return CFG.refPoolId;
  const m = db.meta;
  const known = m.get("poolId");
  if (known !== undefined && Number(known) >= 0) return Number(known);
  if (known !== undefined && !due("poolRescan", 3_600_000)) return null; // none last time
  const from = m.num("poolScan");
  const page = await view<Pool[]>(CFG.ref, "get_pools", { from_index: from, limit: PAGE });
  page.forEach((p, k) => {
    const iw = p.token_account_ids.indexOf(CFG.wrap);
    if (p.pool_kind !== "SIMPLE_POOL" || p.token_account_ids.length !== 2 || iw < 0 || !p.token_account_ids.includes(CFG.token)) return;
    const depth = Number(BigInt(p.amounts[iw]) / 10n ** 18n); // in milli-NEAR, enough to compare
    if (depth > m.num("poolBestDepth", -1)) (m.set("poolBest", from + k), m.set("poolBestDepth", depth));
  });
  if (page.length === PAGE) {
    m.set("poolScan", from + PAGE); // more to look through next tick
    return null;
  }
  // scanned them all
  const best = m.num("poolBest", -1);
  m.set("poolId", best);
  for (const k of ["poolScan", "poolBest", "poolBestDepth"]) m.set(k, k === "poolScan" ? 0 : -1);
  if (best >= 0) console.log(`◆ price from pool ${best} (${CFG.token}/${CFG.wrap})`);
  return best >= 0 ? best : null;
}

/** Slow-moving facts (vault balance, spot price, supply, NEAR/USD), each refreshed when stale. */
export async function refreshMarket(engine: Engine, db: Db) {
  const jobs: Promise<void>[] = [];
  if (due("vault", 20_000))
    jobs.push(available(CFG.vaultAccount).then((y) => void (engine.vaultBalance = yoctoToNear(y))));
  if (due("supply", 10 * 60_000))
    jobs.push(view<string>(CFG.token, "ft_total_supply").then((s) => void (engine.supply = Number(BigInt(s)) / 10 ** engine.decimals)));
  const poolId = await poolFor(db).catch((e) => (console.warn("pool:", (e as Error).message), null));
  if (poolId !== null && due("pool", 30_000))
    jobs.push(
      view<Pool>(CFG.ref, "get_pool", { pool_id: poolId }).then((pool) => {
        const iw = pool.token_account_ids.indexOf(CFG.wrap);
        const it = pool.token_account_ids.indexOf(CFG.token);
        if (iw < 0 || it < 0) throw new Error(`pool ${poolId} is not ${CFG.token}/${CFG.wrap}`);
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
