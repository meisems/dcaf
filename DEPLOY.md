# Deploy on Cloudflare (dashboard only)

Two Cloudflare projects, both built straight from this GitHub repo. No CLI needed.

| Project | Type | What it runs |
|---|---|---|
| `dcaf` | Worker + Durable Object | indexer, rounds, payouts, API |
| `dcaf-7qd` (any name) | Pages | the website (+ a small function that forwards `/api/*` to the engine) |

> **Plan:** the engine runs an alarm every ~2 s. Use **Workers Paid** ($5/mo); the free plan's 10 ms CPU limit is too tight once trading picks up.

---

## 1. Engine (Worker)

1. **Workers & Pages → Create → Workers → Import a repository**, choose `meisems/dcaf`.
2. Settings:
   - Project name: `dcaf` (must match `name` in `server/wrangler.jsonc`)
   - **Root directory:** `server`
   - Build command: *(leave empty)*
   - Deploy command: `npx wrangler deploy`
3. **Deploy.** The Durable Object, its SQLite storage and the 1-minute cron are created from `server/wrangler.jsonc`.
4. **dcaf (Worker) → Settings → Variables and Secrets → Add**:

   **Text settings are added for you:** they're declared under `vars` in [`server/wrangler.jsonc`](server/wrangler.jsonc), and every deploy writes them to the Worker, so they appear in the dashboard by themselves. Change them in that file and push; an edit made in the dashboard is replaced on the next deploy. Only **Secrets** are added by hand in the dashboard. The website's Text settings work the same way in [`.env.production`](.env.production), except that a value set in the Pages dashboard wins over the file.

   The full list, with where to get each value, is in [`server/.env.example`](server/.env.example) (the website's is in [`.env.example`](.env.example)). A value written as `<something>` is a placeholder and counts as not set, so you can add everything now and fill in real values later.

| Name | Type | Example |
|---|---|---|
| `TOKEN_CONTRACT` | Text | `dcainnear.tkn.near` |
| `TOKEN_SYMBOL` | Text | `DCA` |
| `VAULT_ACCOUNT` | Text | `vault.dcainnear.near` |
| `START_BLOCK` | Text | launch block height |
| `REF_POOL_ID` | Text | TOKEN/wNEAR pool id on Rhea |
| `TOP_N` | Text | `0` (everyone who qualifies is paid; a number pays only the top N) |
| `EQUAL_SHARE` | Text | `0.5` (part of each round split equally; the rest goes by weight) |
| `MAX_SHARE` | Text | `0.25` (most of a round one wallet can take) |
| `MIN_BUY` / `MIN_TOTAL` | Text | `0.1` / `1` |
| `ROUND_MIN` / `ROUND_MAX` | Text | `10` / `15` (minutes) |
| `MIN_HOLDERS` | Text | `15` (the first window opens once this many wallets hold the token) |
| `REWARD_SHARE` | **Secret** | **required**: the part of every fee claim that goes to DCAers, from `0` to `1`. Not in the code and never published. |
| `FEE_ACCOUNT` | Text | optional: the wallet you claim fees into (defaults to `VAULT_ACCOUNT`). Every NEAR or wNEAR that arrives there counts as fees received. |
| `VAULT_PRIVATE_KEY` | **Secret** | `ed25519:…` of the vault. **Leave unset for a dry run.** |
| `LAVA_RPC_URL` | **Secret** | your Lava NEAR mainnet HTTPS endpoint (key inside). First choice for payouts. |
| `DRPC_RPC_URL` | **Secret** | your dRPC NEAR HTTPS endpoint (key inside). Second choice for payouts. |
| `PRIVATE_RPC_URLS` | Secret | optional, more private endpoints, comma separated (GetBlock, NodeReal, QuickNode…) |
| `FASTNEAR_API_KEY` | Secret | optional, higher rate limits (sent to FastNEAR hosts only) |

   Saving deploys a new version. `keep_vars` in `wrangler.jsonc` keeps these on every future Git deploy.
5. Check `https://dcaf.<your-subdomain>.workers.dev/api/health`. `started: true` means it is live; until the token has `MIN_HOLDERS` holders the engine indexes but no window opens.

**Starting over:** set `RESET_ID` in `server/wrangler.jsonc` to any new value and push. On the next start the engine wipes its stored data once (trades, wallets, rounds, payouts) and begins again from the chain head. Leaving it unchanged never wipes anything. Changing `TOKEN_CONTRACT` also starts over.

The rewards share is never published: it isn't in the code, and `/api/snapshot` omits it.

### Fees

Claim fees into `FEE_ACCOUNT` (the vault by default). On each claim the engine credits `REWARD_SHARE` of it to the rewards pool. The rest stays in that wallet for the platform; when you withdraw it, leave at least the current pool (`/api/snapshot` → `info.pool`) plus the reserve, so payouts can always be sent. Gas refunds, payouts going out and unwrapping your own wNEAR are not counted as fees.

### RPC endpoints

- **Reads** (balances, metadata, price, block height) go to your private endpoints first (`LAVA_RPC_URL`, `DRPC_RPC_URL`, `PRIVATE_RPC_URLS`; fastest healthy one first), and fall back to the public NEAR endpoints. An endpoint that errors, times out or rate-limits is skipped and cooled off (5 s, doubling up to 5 min). Built-in public fallbacks, all verified for `block`, view calls and `send_tx`:
  `free.rpc.fastnear.com`, `rpc.mainnet.fastnear.com`, `near.drpc.org`, `rpc.shitzuapes.xyz`, `rpc.intea.rs`, `near-mainnet.gateway.tatum.io`, `archival-rpc.mainnet.fastnear.com`, `rpc.mainnet.near.org`.
- **Transactions** (payouts) go to `LAVA_RPC_URL` first, then `DRPC_RPC_URL`, then `PRIVATE_RPC_URLS` in order. If all of them are down, the already-signed payout is broadcast through the public endpoints (set `TX_PUBLIC_FALLBACK` = `false` to forbid that).
- Every payout is signed once and stored before it is sent. A timeout or a switch to another RPC re-sends or looks up that same transaction, so a wallet is never paid twice.
- `RPC_URLS` (Text, comma separated) replaces the public list. `RPC_URL` adds one endpoint in front of it.
- Lava's old public `near.lava.build` endpoint is discontinued, and Ankr and BlockPI now need keys. Use the URL from your own Lava or dRPC dashboard.
- `/api/health` shows each endpoint's state by **hostname only**. URLs, and the keys in them, are never shown or logged.

## 2. Website (Pages)

1. **Workers & Pages → Create → Pages → Connect to Git**, choose `meisems/dcaf`.
2. Build settings:
   - Framework preset: *None*
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: *(empty)*
3. **Environment variables** (Production):

| Name | Example |
|---|---|
| `VITE_TOKEN_CONTRACT` | `dcainnear.tkn.near` |
| `VITE_TOKEN_SYMBOL` | `DCA` |
| `VITE_BUY_URL` | optional, default Rhea swap for the token |

4. **Save and Deploy.**
5. Optional: **Pages project → Settings → Bindings → Add → Service binding:** variable `ENGINE`, service `dcaf`. Save, then **Deployments → … → Retry deployment** so the binding applies.

   Without a binding the site forwards `/api/*` to `ENGINE_URL`, or to `https://dcaf.laidev.workers.dev` (`DEFAULT_ENGINE_URL` in `functions/api/[[path]].ts`).

Open the Pages URL. `/api/health` on the site should answer from the engine.

## Updating

Push to `main`. Both projects rebuild and redeploy automatically.

## Going live checklist

- [ ] Dry run first (no `VAULT_PRIVATE_KEY`) and check a few rounds in **Rounds**
- [ ] Vault account funded; keep only what upcoming rounds need
- [ ] Add `VAULT_PRIVATE_KEY` as a **Secret**
- [ ] Custom domain on the Pages project (optional)

## Local development (optional)

```bash
npm install && (cd server && npm install)
cp server/.env.example server/.dev.vars   # then fill it in
npm run engine   # the Worker, locally, in Cloudflare's runtime
npm run dev      # the site, proxying /api to the engine
```
