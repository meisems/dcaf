// Local runner (development and tests). Production runs on Cloudflare: see worker.ts.
import { existsSync } from "node:fs";
import { startApi } from "./api.ts";
import { CFG, initConfig } from "./config.ts";
import { bindToken } from "./db.ts";
import { openNodeDb } from "./db-node.ts";
import { Engine } from "./engine.ts";
import { run } from "./indexer.ts";
import { loadToken, refreshMarket } from "./market.ts";
import { finalHeight, sleep } from "./near.ts";
import { sendPayouts } from "./payouts.ts";
import { Reader } from "./read.ts";

if (existsSync(".env")) process.loadEnvFile(".env");
initConfig(process.env);

const db = openNodeDb(CFG.db);
bindToken(db, CFG.token, CFG.resetId);
const engine = new Engine(db);
const reader = new Reader(db, engine);
let stopping = false;

console.log(`dcainnear engine (local) · ${CFG.network} · token ${CFG.token} · vault ${CFG.vaultAccount}${CFG.dryRun ? " · DRY RUN" : ""}`);

await loadToken(engine, db);
void refreshMarket(engine, db);
setInterval(() => void refreshMarket(engine, db), 5000);
startApi(reader, engine);

const start = CFG.startBlock ?? (await finalHeight());
console.log(db.meta.get("done") ? `◆ resuming after block ${db.meta.get("done")}` : `◆ indexing from block ${start}`);

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    stopping = true;
    setTimeout(() => process.exit(0), 300);
  });

void (async () => {
  while (!stopping) {
    await sendPayouts(db).catch((e) => console.warn("payouts:", (e as Error).message));
    await sleep(2000);
  }
})();

let last = 0;
await run(
  db,
  {
    onBlock: (b, swaps) => engine.onBlock(b, swaps),
    onClock: (t, height) => {
      engine.headHeight = height;
      engine.onClock(t, height);
      if (Date.now() - last > 30_000) {
        last = Date.now();
        console.log(`  block ${height} · ${Math.max(0, Math.floor(Date.now() / 1000) - t)}s behind`);
      }
    },
  },
  () => stopping,
  start,
);
